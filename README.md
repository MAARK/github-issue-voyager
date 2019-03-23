# GitHub Issue Migrator 

Configuration-based CLI tool to migrate issues across GitHub repositories. 

Based on <https://github.com/buildo/gh-issue-mover>. 

## Usage

Install from npm (TODO - when completed):

```bash
npm install -g github-issue-mover 
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
    "closeIssueWhenComplete" : false
  }, 
  "userMappings" : [
    {"source": "first-username", "destination" : "second-username"} 
  ]
}
```

`sourceRepository` contains details of the originating repo: 

`repoOwner` - owner of the repo (organization or user) 

`repoName` - name of the repo

`accessToken` - 

| Name                     | Description                                                  | Req. |
| ------------------------ | ------------------------------------------------------------ | ---- |
| `sourceRepository`       | Contains details of the originating repo.                    | Yes  |
| `repoOwner`              | Owner of the repo (organization or user)                     | Yes  |
| `repoName`               | Name of the repo                                             | Yes  |
| `accessToken`            | Developer token generated from Github.com to provide API access to the repo. | Yes  |
| `destinationRepository`  | Contains details of the destination repo.                    | Yes  |
| `method`                 | Type of migration (`all` = All issues, `label` = All with matching label(s), `issueNumber` = All with matching issue number(s) | Yes  |
| `labels`                 | Array of labels you wish to filter on (used when `method` = `label`) | No   |
| `issueNumbers`           | Array of issue numbers you wish you migrate (used when `method` = `issueNumber`) | No   |
| `stickyUsers`            | Boolean value indicating whether to maintain usernames when migrating the issue to the new repo. Default is `true`. | No   |
| `closeIssueWhenComplete` | Boolean value indicating whether to close the issue in the source repo on successful migration. Default is `false`. | No   |
| `userMappings`           | Array of username pairs that is used when `stickyUsers` = `false`. When moving repos across organizations, these mappings are used to make sure usernames are maintained in assignments and inside the issue body and comments. | No   |

Once you have configured your `config.json`, run from the command line using: 

```bash
github-issue-mover --config=config.json
```

