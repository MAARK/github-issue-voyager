const log = require('./log'); 
const Octokat = require('octokat');
const bbPromise = require('bluebird');

/*
 * Base class for migrating issues.  
 */

class IssueVoyager {

    constructor(config) {
        this.sourceClient = new Octokat({
            token: config.sourceRepository.accessToken
        });
        this.sourceOwner = config.sourceRepository.repoOwner;
        this.sourceName = config.sourceRepository.repoName;
        this.method = config.options.method;
        this.labels = config.options.labels;
        this.issueNumbers = config.options.issueNumbers;
        this.stickyUsers = config.options.stickyUsers;
        this.closeIssueWhenComplete = config.options.closeIssueWhenComplete;
        this.userMappings = config.mappings.users;
    }

    async execute() {
        this.source = await this.sourceClient.repos(this.sourceOwner, this.sourceName).fetch();
        if (this.method === 'issueNumber') {
            await this._migrateIssuesByIssueNumber();
        } else {
            await this._migrateIssuesWithPagination();
        }
    }

    async _migrateIssuesWithPagination() {
        let page; 
        if (this.labels.length > 0 && this.method === 'label') {
            const labels = this.labels;        
            page = await this.source.issues.fetch({labels, state: 'open', filter: 'all', direction: 'asc', per_page: 100});
        }
        else {
            page = await this.source.issues.fetch({state: 'open', filter: 'all', direction: 'asc', per_page: 100});
        }
        let allIssues = page.items;  
        while (typeof page.nextPage === 'function') {
            page = await page.nextPage.fetch(); 
            allIssues = allIssues.concat(page.items); 
        }
        const issues = allIssues.filter(i => !i.pullRequest);
        if (issues.length === 0) {
            log.warn(`😢 Sorry, no issues found`);
            return null;
        }
        await this._migrateIssues(issues);
    }

    async _migrateIssuesByIssueNumber() {
        const issues = await Promise.all(this.issueNumbers.map(async (issueNumber) => {
            return await this.source.issues(issueNumber).fetch()
            .catch(function() {
                log.err(`😢 Sorry, no issue found matching issue number: ${issueNumber.toString()}`);
                return null;
            }); 
        }));

        if (issues) {
            return await this._migrateIssues(issues);
        }
        else {
            return null; 
        } 
    }

    async _migrateIssues(issues) {
        log.i(`${issues.length} issue(s) will be migrated`); 
        await bbPromise.each(issues, issue => {
            return this._migrateIssue(issue);  
        });  
    }

    _mapUser(sourceUser, useUsername = true) {
        let result = "";
        for (var i = 0, len = this.userMappings.length; i < len; i++) {
            let u = this.userMappings[i];
            if (u.source === sourceUser) {
                result = useUsername ? u.destination : u.destinationName;
                break;
            }
        }
        return result;
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
}

module.exports = IssueVoyager; 
