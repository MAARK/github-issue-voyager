/*jshint esversion: 6 */

const log = require('./log'); 
const pick = require('lodash').pick;
const Octokat = require('octokat'); 
const moment = require('moment'); 
const bbPromise = require('bluebird');

/*
 * GitHubIssueVoyager fetches issues from specified GitHub source
 * repository and then outputs in a destination repo.  
 */

module.exports = class GitHubIssueVoyager {

    constructor(config) {
        this.sourceClient = new Octokat({
            token: config.sourceRepository.accessToken
        });
        this.destinationClient = new Octokat({
            token: config.destinationRepository.accessToken
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
        this.addSourceComment = config.options.addSourceComment; 
        this.userMappings = config.mappings.users; 
    }

    async execute() {
        this.source = await this.sourceClient.repos(this.sourceOwner, this.sourceName).fetch();
        this.destination = await this.destinationClient.repos(this.destinationOwner, this.destinationName).fetch();
        if (this.method === 'issueNumber') {
            await this._migrateIssuesByIssueNumber();
        } else {
            await this._migrateIssuesWithPagination();
        }
        return true; 
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
        const issueNumbers = this.issueNumbers;
        const issues = await Promise.all(this.issueNumbers.map(async (issueNumber) => {
            return await this.source.issues(issueNumber).fetch()
            .catch(function(error) {
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

            // Use bluebird to ensure proper order of comments  
            await bbPromise.each(comments.items, comment => {
                return this._migrateComment(newIssue, comment); 
            });            

            if (this.addSourceComment) {
                await this.source.issues(originalIssue.number).comments.create({
                    body: `Issue migrated to https://github.com/${this.destinationOwner}/${this.destinationName}/issues/${newIssue.number}`
                });    
            }
            if (this.closeWhenComplete) {
                await this.source.issues(originalIssue.number).update({ state: 'closed' });        
            }
            log.success(`🤘 Successfully migrated issue from ${this.sourceOwner}/${this.sourceName} #${originalIssue.number} to ${this.destinationOwner}/${this.destinationName} #${newIssue.number}`); 
            return newIssue;

        } catch (e) {
          log.err(`😱 Something went wrong while migrating issue #${originalIssue.number}!`);
          log.err(JSON.stringify(e, null, 2));
        }
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

    _mapUser(sourceUser) {
        let result = ""; 
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









}    