/*jshint esversion: 6 */

const IssueVoyager = require('./issueVoyager'); 
const log = require('./log'); 
const moment = require('moment');
const fs = require('fs');
const fsp = require('fs').promises;

/*
 * JiraIssueVoyager fetches issues from specified GitHub source
 * repository and then outputs a CSV that can be used for 
 * importing into Jira.  
 */

class JiraIssueVoyager extends IssueVoyager {

    constructor(config) {
        super(config); 
        this.priorityMappings = config.mappings.priorities; 
        this.typeMappings = config.mappings.types;
        this.maxCommentCount = 0; 
        this.exportIssueList = [];
        this.exportFolder = config.options.exportPath;
    }
    
    async execute() {
        await super.execute(); 
        if (this.exportIssueList.length > 0) {
            await this._createFolder(); 
            const filename = `${this.exportFolder}/${this.sourceName}.csv`;
            await this._writeToFile(filename, this.exportIssueList);        
            return true;    
        }
        else {
            return false; 
        }
    }

    async _migrateIssues(issues) {
        this.maxCommentCount = this._getMaxCommentCount(issues); 
        this._createCSVHeader(); 
        await super._migrateIssues(issues); 
    }

    async _migrateIssue(originalIssue) {
        let test =  this._mapUser(originalIssue.assignees[0].login); 
        if (!originalIssue) {
            // Use case - invalid issue number is provided when migrating by issue number
            log.i(`A null issue was found. Ignoring.`); 
            return null; 
        }
        const title = this._safe(originalIssue.title); 
        const assignee = (originalIssue.assignees.length > 0 ? (this.stickyUsers ? originalIssue.assignees[0].login : this._mapUser(originalIssue.assignees[0].login)) : '');
        const reporter = (this.stickyUsers ? originalIssue.user.login : this._mapUser(originalIssue.user.login));
        const type = this._getTypeFromLabels(originalIssue.labels); 
        const priority = this._getPriorityFromLabels(originalIssue.labels); 
        const descr = this._safe(this._mapUsersInBody(originalIssue.body));
        let exportIssue = `"${title}",${assignee},${reporter},${type},${priority},"${descr}"`;
        try {
            const comments = await this.source.issues(originalIssue.number).comments.fetch({per_page: 100});
            comments.items.forEach(comment => {
                //Using default: https://docs.oracle.com/javase/1.5.0/docs/api/java/text/SimpleDateFormat.html
                const timestamp = moment(comment.createdAt).format('DD/MMM/YY h:mm a');
                const username = (this.stickyUsers ? comment.user.login : this._mapUser(comment.user.login)); 
                const body = this._safe(this._mapUsersInBody(comment.body));
                //https://confluence.atlassian.com/adminjiraserver074/importing-data-from-csv-881683854.html
                const cmt = `${timestamp}; ${username}; ${body}`; 
                exportIssue = `${exportIssue},"${cmt}"`; 
            });
            for (var i=comments.items.length; i < this.maxCommentCount; i++) {
                exportIssue = `${exportIssue},`; 
            }
            this.exportIssueList.push(exportIssue);
            if (this.closeWhenComplete) {
                await this.source.issues(originalIssue.number).update({ state: 'closed' });
            }
            log.i(`🤘 Successfully exported issue from ${this.sourceOwner}/${this.sourceName} #${originalIssue.number}`);
            return true;
        } catch (e) {
            log.err(`😱 Something went wrong while migrating issue #${originalIssue.number}: ${e.message}`);
        }
    }

    _replaceUser(sourceUser, body) {
        let srcUser = `@${sourceUser}`;
        let destUser = `@${this._mapUser(sourceUser, false)}`;
        return body.replace(new RegExp(srcUser, 'gi'), destUser);
    }

    _safe(body) {
        // replace quotes, bad chars, and line endings                                 
        return body.replace(/"/g,"'").replace(/–/g,"-").replace(/\n/g,"\r\n");           
    }

    _getComment(issue, originalComment) {
        const timestamp = moment(originalComment.createdAt).fromNow(); 
        const username = (this.stickyUsers ? originalComment.user.login : this._mapUser(originalComment.user.login)); 
        const body = this._mapUsersInBody(originalComment.body);
        return `${timestamp};${username};${body}`; 
    }

    _getTypeFromLabels(labels) {
        let result = "";
        for (var i = 0, len = this.typeMappings.length; i < len; i++) {
            let p = this.typeMappings[i];
            for (var x = 0, len2 = labels.length; x < len2; x++) {
                const lbl = labels[x].name;  
                if (lbl === p.source) {
                    result = p.destination;
                    break;
                }
            }
        }
        return result;
    }

    _getPriorityFromLabels(labels) {
        let result = "";
        for (var i = 0, len = this.priorityMappings.length; i < len; i++) {
            let p = this.priorityMappings[i];
            for (var x = 0, len2 = labels.length; x < len2; x++) {
                const lbl = labels[x].name;  
                if (lbl === p.source) {
                    result = p.destination;
                    break;
                }
            }
        }
        return result;
    }

    _getMaxCommentCount(issues) {
        let result = 0;
        issues.forEach(issue => {
            if (issue && issue.comments > result) {
                result = issue.comments; 
            }
        });
        return result; 
    }

    _createCSVHeader() {
        const c = ",Comment"; 
        let cs = ""; 
        for (var i=0; i < this.maxCommentCount; i++) {
            cs += c; 
        }
        this.exportIssueList.push(`Summary,Assignee,Reporter,Issue Type,Priority,Description${cs}`);
    }

    async _createFolder() {  
        if (!fs.existsSync(this.exportFolder)) {
            try{
                return await fsp.mkdir(this.exportFolder); 
              }catch(err){
                log.err(err); 
              }
        }
    }

    async _writeToFile(filename, arr) {
        return new Promise((resolve, reject) => {
          const file = fs.createWriteStream(filename);
          for (const line of arr) {
            file.write(`${line}\r\n`);
          }
          file.end();
          file.on("finish", () => {  log.success(`📃GitHub to Jira export file created at ${filename}`); resolve(null); }); 
          file.on("error", reject); 
        });
      }

}

module.exports = JiraIssueVoyager
