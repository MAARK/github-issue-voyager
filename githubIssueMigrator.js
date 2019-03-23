require('colors'); 
const pick = require('lodash').pick;
const Octokat = require('octokat'); 
const moment = require('moment'); 
const bbPromise = require('bluebird');

module.exports = class GithubClient {

    constructor(config) {
        this.sourceClient = new Octokat({
            token: config.sourceRepository.accessToken,
            rootURL: config.sourceRepository.rootURL
        });

        this.destinationClient = new Octokat({
            token: config.destinationRepository.accessToken,
            rootURL: config.destinationRepository.rootURL
        });

        this.sourceOwner = config.sourceRepository.repoOwner; 
        this.sourceName = config.sourceRepository.repoName; 
        this.destinationOwner = config.destinationRepository.repoOwner; 
        this.destinationName = config.destinationRepository.repoName; 

        this.method = config.options.method; 
        this.labels = config.options.labels; 
        this.issueNumbers = config.options.issueNumbers; 
        this.stickyUsers = config.options.stickyUsers; 
        this.closeIssueWhenComplete = config.options.closeIssueWhenComplete; 
        this.userMappings = config.userMappings; 
    }

    async execute() {

        this.source = await this.sourceClient.repos(this.sourceOwner, this.sourceName).fetch();
        this.destination = await this.destinationClient.repos(this.destinationOwner, this.destinationName).fetch();

        // labels, issueNumbers, all (could do assignees) 

        if (this.method === 'label') {
            await this._migrateIssuesByLabel(); 
        } else if (this.method == 'issueNumber') {
            await this._migrateIssuesByIssueNumber(); 
        } else {
            await this._migrateAllIssues(); 
        }

        return true; 
    }

    _mapUser(sourceUser) {
        let result = ""; 
        // https://coderwall.com/p/kvzbpa/don-t-use-array-foreach-use-for-instead
        for (var i = 0, len = this.userMappings.length; i < len; i++) {
            let u = this.userMappings[i]; 
            if (u.source === sourceUser) {
                result = u.destination; 
                break;
            }
        }
        return result; 
    }

    _replaceUser(sourceUser, body) {
        let srcUser = `@${sourceUser}`; 
        let destUser = `@${this._mapUser(sourceUser)}`; 
        return body.replace(new RegExp(srcUser, 'gi'), destUser);
    }

    _mapUsersInBody(body) {
        let result = body; 
        if (!this.stickyUsers) {
            this.userMappings.map(user => {
                result = this._replaceUser(user.source, result); 
            }); 
        }    
        return result; 
    }

    async _migrateComment(issue, originalComment) {
        const username = (this.stickyUsers ? originalComment.user.login : this._mapUser(originalComment.user.login)); 
        const timestamp = moment(originalComment.createdAt).fromNow(); 
        const migrationNote = `_@${username} originally added this comment on ${timestamp}._` ;
        const newBody = this._mapUsersInBody(originalComment.body); 
        const commentToCreate = {
            body: `${migrationNote}\n\n${newBody}`
        };
        return await this.destination.issues(issue.number).comments.create(commentToCreate);
    }

    async _migrateIssue(originalIssue) {
        const username = (this.stickyUsers ? originalIssue.user.login : this._mapUser(originalIssue.user.login)); 
        const timestamp = moment(originalIssue.createdAt).format('MMMM Do YYYY'); 
        const migrationNote = `_Issue migrated from ${this.sourceOwner}/${this.sourceName}._\n_@${username} created the original issue on ${timestamp}._` ;
        const newBody = this._mapUsersInBody(originalIssue.body); 
        const issueToCreate = {
            ...pick(originalIssue, ['title', 'labels']),
            assignees: (this.stickyUsers ? originalIssue.assignees.map(a => a.login)  : originalIssue.assignees.map(a => this._mapUser(a.login))),
            body: `${migrationNote}\n\n${newBody}`
        };

        try {
            const newIssue = await this.destination.issues.create(issueToCreate);
            const comments = await this.source.issues(originalIssue.number).comments.fetch({per_page: 100});

            // Cannot ensure correct order 
            // await Promise.all(comments.items.map(async (comment) => {
            //     const nc = await this._migrateComment(newIssue, comment); 
            // }));

            // Use bluebird to ensure proper order of comments  
            await bbPromise.each(comments.items, comment => {
                return this._migrateComment(newIssue, comment); 
            });            

            await this.source.issues(originalIssue.number).comments.create({
                body: `Issue migrated to https://github.com/${this.destinationOwner}/${this.destinationName}/issues/${newIssue.number}`
            });
            if (this.closeWhenComplete) {
                await this.source.issues(originalIssue.number).update({ state: 'closed' });        
            }
            console.log(
                '🤘 Successfully migrated issue from',
                `${this.sourceOwner}/${this.sourceName} #${originalIssue.number}`.blue,
                'to',
                `${this.destinationOwner}/${this.destinationName} #${newIssue.number}`.green,
                '\n'
            );
            return newIssue;

        } catch (e) {
          console.log(`😱 Something went wrong while migrating issue #${originalIssue.number}!`);
          console.log(JSON.stringify(e, null, 2));
        }
    }

    async _migrateIssues(issues) {
        console.log(`${issues.length} issue(s) will be migrated`); 
        await bbPromise.each(issues, issue => {
            return this._migrateIssue(issue);  
        });  
    }

    async _migrateIssuesByLabel() {
        const labels = this.labels; 
        // Note: GitHub's REST API v3 considers every pull request an issue, but not every issue 
        // is a pull request. For this reason, "Issues" endpoints may return both issues and pull 
        // requests in the response. You can identify pull requests by the pull_request key.
        // https://developer.github.com/v3/issues/#list-issues
        const allIssues = await this.source.issues.fetch({labels, state: 'open', filter: 'all', direction: 'asc', per_page: 100 });
        const issues = allIssues.items.filter(i => !i.pullRequest);
        if (issues.length === 0) {
            console.log(`Sorry, no issues found matching specified criteria`);
            return null; 
        }
        await this._migrateIssues(issues); 
        // await Promise.all(issues.items.map(async (issue) => {
        //     const ni = await this._migrateIssue(issue);
        // }));
    }

    async _migrateAllIssues() {      
        // TODO Support paged results: https://github.com/philschatz/octokat.js/#paged-results
        // TODO combine this will label routine 
        const allIssues = await this.source.issues.fetch({state: 'open', filter: 'all', direction: 'asc', per_page: 100});
        const issues = allIssues.items.filter(i => !i.pullRequest);
        if (issues.length === 0) {
            console.log(`Sorry, no issues found`);
            return null; 
        }
        await this._migrateIssues(issues);         
    }

    async _migrateIssuesByIssueNumber() {
        const issueNumbers = this.issueNumbers; 
        const issues = await Promise.all(this.issueNumbers.map(async (issueNumber) => {
            // Need to deal with an invalid fetch, returns 404 if invalid 
            return await this.source.issues(issueNumber).fetch(); 
        }));
        if (issues.length === 0) {
            console.log(`Sorry, no issues found matching specified issue numbers: ${issueNumbers.split(', ').map(l => l.red)}`);
            return null; 
        }
        await this._migrateIssues(issues);         
    }
    



}    