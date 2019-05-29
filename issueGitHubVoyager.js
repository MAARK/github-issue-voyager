/*jshint esversion: 6 */

const IssueVoyager = require('./issueVoyager');
const log = require('./log'); 
const pick = require('lodash').pick;
const Octokat = require('octokat'); 
const moment = require('moment'); 
const bbPromise = require('bluebird');

/*
 * GitHubIssueVoyager fetches issues from specified GitHub source
 * repository and then outputs in a destination repo.  
 */

class GitHubIssueVoyager extends IssueVoyager {

    constructor(config) {
        super(config); 
        this.destinationClient = new Octokat({
            token: config.destinationRepository.accessToken
        });
        this.destinationOwner = config.destinationRepository.repoOwner; 
        this.destinationName = config.destinationRepository.repoName; 
        this.addSourceComment = config.options.addSourceComment; 
    }

    async execute() {
        this.destination = await this.destinationClient.repos(this.destinationOwner, this.destinationName).fetch();
        await super.execute(); 
        return true; 
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
          log.err(`😱 Something went wrong while migrating issue #${originalIssue.number}: ${e.message}`);
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

    _replaceUser(sourceUser, body) {
        let srcUser = `@${sourceUser}`; 
        let destUser = `@${this._mapUser(sourceUser)}`; 
        return body.replace(new RegExp(srcUser, 'gi'), destUser);
    }

}    

module.exports = GitHubIssueVoyager