# GitHub Issue Voyager 

Configuration-based CLI tool to migrate issues across GitHub repositories or to export to Jira.

Based largely on <https://github.com/buildo/gh-issue-mover>. `gh-issue-mover` is more command-line based, whereas I wrote GitHub Issue Voyager as a utility that could be fully pre-configured from a config file. Also, I needed to be able to map usernames across repos as well as adding exporting capabilities to Jira.

## Usage

Install from npm (TODO - when completed):

```bash
npm install -g github-issue-voyager 
```

Create a configuration file that contains all of the details of the migration: 

```json
{
  "sourceRepository": {
    "repoOwner": "MyFirstOwner",
    "repoName": "MyFirstRepoName",
    "accessToken": "11111111111111111111111111111111111"
  },
  "destinationRepository": {
    "repoOwner": "MySecondOwner",
    "repoName": "MySecondRepoName",
    "accessToken": "11111111111111111111111111111111111"
  },
  "options" : {
    "method" : "all", 
    "labels" : ["frontend"], 
    "issueNumbers" : [27, 28], 
    "stickyUsers" : false, 
    "closeIssueWhenComplete" : false, 
    "exportToJira": false
  },
  "userMappings" : [
    {"source": "first-username", "destination" : "second-username"} 
  ]
}
```

| Name                     | Description                                                  | Req. |
| ------------------------ | ------------------------------------------------------------ | ---- |
| `sourceRepository`       | Contains details of the originating repo.                    | Yes  |
| `repoOwner`              | Owner of the repo (organization or user)                     | Yes  |
| `repoName`               | Name of the repo                                             | Yes  |
| `accessToken`            | Developer token generated from Github.com to provide API access to the repo. | Yes  |
| `destinationRepository`  | Contains details of the Github destination repo.                    | Yes (for GitHub), No (for Jira)  |
| `method`                 | Type of migration (`all` = All issues, `label` = All with matching label(s), `issueNumber` = All with matching issue number(s) | Yes  |
| `labels`                 | Array of labels you wish to filter on (used when `method` = `label`) | No   |
| `issueNumbers`           | Array of issue numbers you wish you migrate (used when `method` = `issueNumber`) | No   |
| `stickyUsers`            | Boolean value indicating whether to maintain usernames when migrating the issue to the new repo. Default is `true`. | No   |
| `closeIssueWhenComplete` | Boolean value indicating whether to close the issue in the source repo on successful migration. Default is `false`. | No   |
| `exportToJira`           | Boolean value that determines whether to migrate issues to Jira instead of another Github repo. Default is `false`. | No |
| `userMappings`           | Array of username pairs that is used when `stickyUsers` = `false`. When moving repos across organizations or when exporting to Jira, these mappings are used to make sure usernames are maintained in assignments and inside the issue body and comments. | No   |

Once you have configured your `config.json`, run from the command line using:

```bash
github-issue-voyager --config=config.json
```

