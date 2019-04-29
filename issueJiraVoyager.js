/*jshint esversion: 6 */

require('colors');
const pick = require('lodash').pick;
const Octokat = require('octokat');
const moment = require('moment');
const bbPromise = require('bluebird');
const fs = require('fs');

module.exports = class GithubClient {

    constructor(config) {

        this.sourceClient = new Octokat({
            token: config.sourceRepository.accessToken,
            rootURL: config.sourceRepository.rootURL
        });
        this.sourceOwner = config.sourceRepository.repoOwner;
        this.sourceName = config.sourceRepository.repoName;

        this.method = config.options.method;
        this.labels = config.options.labels;
        this.issueNumbers = config.options.issueNumbers;
        this.stickyUsers = config.options.stickyUsers;
        this.closeIssueWhenComplete = config.options.closeIssueWhenComplete;
        this.userMappings = config.userMappings;

        this.maxCommentCount = 0; 
        this.exportIssueList = [];
    }

    async execute() {

        this.source = await this.sourceClient.repos(this.sourceOwner, this.sourceName).fetch();

        // labels, issueNumbers, all (could do assignees)

        if (this.method === 'label') {
            await this._migrateIssuesByLabel();
        } else if (this.method == 'issueNumber') {
            await this._migrateIssuesByIssueNumber();
        } else {
            await this._migrateAllIssues();
        }

        const filename = `output/${this.sourceName}.csv`;

        await this._writeToFile(filename, this.exportIssueList);

        return true;
    }

    _mapUser(sourceUser, useUsername = true) {
        let result = "";
        // https://coderwall.com/p/kvzbpa/don-t-use-array-foreach-use-for-instead
        for (var i = 0, len = this.userMappings.length; i < len; i++) {
            let u = this.userMappings[i];
            if (u.source === sourceUser) {
                result = useUsername ? u.destination : u.destinationName;
                break;
            }
        }
        return result;
    }

    _replaceUser(sourceUser, body) {
        let srcUser = `@${sourceUser}`;
        let destUser = `@${this._mapUser(sourceUser, false)}`;
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

    _safe(body) {
        // replace quotes & bad chars                                
        return body.replace(/"/g,"'").replace(/–/g,"-").replace(/\n/g,"\r\n");      
        // strips out @ and potentially other things we want
        //.replace(/[^\w\s\n]/gi, '');  
        // heavy duty removal 
        //.replace(/[\x00-\x1F\x7F-\x9F]/g, "");         
    }

    _getComment(issue, originalComment) {

        // TODO  "01/01/2012 10:10;Admin; This comment works".
        const timestamp = moment(originalComment.createdAt).fromNow(); 
        const username = (this.stickyUsers ? originalComment.user.login : this._mapUser(originalComment.user.login)); 
        const body = this._mapUsersInBody(originalComment.body);
        return `${timestamp};${username};${body}`; 
    }

    _getTypeFromLabels(labels) {
        let result = 'Development'; 
        const isDesign = labels.includes('design'); 
        const isTask = labels.includes('task'); 
        const isBug = labels.includes('bug'); 
        if (isBug) {
            result = 'Bug'; 
        } else if (isDesign) {
            result = 'Design'; 
        } else if (isTask) {
            result = 'Development'; 
        } 
        return result; 
    }

    _getPriorityFromLabels(labels) {
        // Highest, High, Low, Lowest
        let result = 'Highest'; 
        const isA = labels.includes('prioritya') || labels.includes('priority a'); 
        const isB = labels.includes('priorityb') || labels.includes('priority b'); 
        const isC = labels.includes('priorityc') || labels.includes('priority c'); 
        if (isA) {
            result = 'Highest'; 
        } else if (isB) {
            result = 'High'; 
        } else if (isC) {
            result = 'Low'; 
        }
        return result; 
    }

    async _migrateIssue(originalIssue) {

        const title = this._safe(originalIssue.title); 
        const assignee = (originalIssue.assignees.length > 0 ? (this.stickyUsers ? originalIssue.assignees[0].login : this._mapUser(originalIssue.assignees[0].login)) : '');
        const reporter = (this.stickyUsers ? originalIssue.user.login : this._mapUser(originalIssue.user.login));
        const type = this._getTypeFromLabels(originalIssue.labels); 
        const priority = this._getPriorityFromLabels(originalIssue.labels); 
        const descr = this._safe(this._mapUsersInBody(originalIssue.body));

        // Summary, Assignee, Reporter, Issue Type, Priority, Description, [Comment]

        let exportIssue = `"${title}",${assignee},${reporter},${type},${priority},"${descr}"`;
 
        try {

            const comments = await this.source.issues(originalIssue.number).comments.fetch({per_page: 100});

            comments.items.forEach(comment => {
                //https://docs.oracle.com/javase/1.5.0/docs/api/java/text/SimpleDateFormat.html
                // Using default 
                const timestamp = moment(comment.createdAt).format('DD/MMM/YY h:mm a');
                const username = (this.stickyUsers ? comment.user.login : this._mapUser(comment.user.login)); 
                const body = this._safe(this._mapUsersInBody(comment.body));
                https://confluence.atlassian.com/adminjiraserver074/importing-data-from-csv-881683854.html
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
            console.log(
                '🤘 Successfully exported issue from',
                `${this.sourceOwner}/${this.sourceName} #${originalIssue.number}`.blue,
                '\n'
            );
            return true;

        } catch (e) {
          console.log(`😱 Something went wrong while migrating issue #${originalIssue.number}!`);
          console.log(JSON.stringify(e, null, 2));
        }
    }

    _getMaxCommentCount(issues) {
        let result = 0;
        issues.forEach(issue => {
            if (issue.comments > result) {
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

    async _migrateIssues(issues) {
        console.log(`${issues.length} issue(s) will be migrated`);
        this.maxCommentCount = this._getMaxCommentCount(issues); 
        this._createCSVHeader(); 
        await bbPromise.each(issues, issue => {
            return this._migrateIssue(issue);
        });
    }

    async _migrateIssuesByLabel() {
        const labels = this.labels;
        const allIssues = await this.source.issues.fetch({labels, state: 'open', filter: 'all', direction: 'asc', per_page: 100 });
        const issues = allIssues.items.filter(i => !i.pullRequest);
        if (issues.length === 0) {
            console.log(`Sorry, no issues found matching specified criteria`);
            return null;
        }
        await this._migrateIssues(issues);
    }

    // async _fetchAll(fn, args) {
    //     let acc = []; // Accumulated results
    //     let p = new Promise((resolve, reject) => {
    //       fn(args).then((val) => {
    //         acc = acc.concat(val);
    //         if (val.nextPage) {
    //           return this._fetchAll(val.nextPage).then((val2) => {
    //             acc = acc.concat(val2);
    //             resolve(acc);
    //           }, reject);
    //         } else {
    //           resolve(acc);
    //         }
    //       }, reject);
    //     });
    //     return p;
    // }

    async _migrateAllIssues() {
        // TODO Support paged results: https://github.com/philschatz/octokat.js/#paged-results
        // TODO combine this will label routine
        const allIssues = await this.source.issues.fetch({state: 'open', filter: 'all', direction: 'asc', per_page: 100});

        //let allIssues = []; 
        
        // await this._fetchAll(this.source.issues.fetch).then((allIssues) => {
        //     console.log(allIssues.length);
        // });

        // await this.source.issues.fetch({state: 'open', filter: 'all', direction: 'asc', per_page: 100})
        // .then((initialIssues) => {
        //     allIssues = [...initialIssues.items]; 
        //     initialIssues.nextPage.fetch()
        //   .then((moreIssues) => {
        //     allIssues = allIssues.concat(moreIssues.items); 
        //     console.log('2nd page of results', moreIssues)
        //   })
        // })

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

    async _writeToFile(filename, arr) {

        const writeStream = fs.createWriteStream(filename);
        const pathName = writeStream.path;
        await arr.forEach(value => writeStream.write(`${value}\r\n`));
        await writeStream.on('finish', () => {
           console.log(`wrote all the array data to file ${pathName}`);
        });
        await writeStream.on('error', (err) => {
            console.error(`There is an error writing the file ${pathName} => ${err}`)
        });
        await writeStream.end();

    }







}