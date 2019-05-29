# GitHub Issue Voyager

## Overview

Fully configuration-based CLI tool to migrate issues across GitHub repositories or to export to Jira.

Based on the handy utility <https://github.com/buildo/gh-issue-mover>. I ended up expanding on some of the capabilities of `gh-issue-mover` due to some additional needs I encountered - e.g., migrating issues from one GitHub organization repo to another (e.g., mapping usernames) as well as the need to export to Jira (via CSV).

### GitHub Migration  

When migrating issues from Github repo to another, Issue Voyager uses the [GitHub REST API v3](https://developer.github.com/v3/issues/) to copy issues from the source to the destination.

### Jira Migration

Jira does not provide a REST API for importing issues. Therefore, you have to go "old school" and export issues out as a CSV and then import them into Jira through its import tool. When exporting to Jira, Issue Voyager creates a CSV file that matches the formatting rules and conventions outlined by Jira: [Importing data from CSV](https://confluence.atlassian.com/adminjiracloud/importing-data-from-csv-776636762.html).

Note: For exporting comments, Issue Voyager uses Jira's default date format to reduce possible import problems.

## Usage

1. Install from npm (TODO - when completed):

```bash
npm install -g github-issue-voyager
```

2. Create a configuration file that contains all of the details of the migration:

3. Once you have configured your `config.json`, run from the command line using:

```bash
github-issue-voyager --config=config.json
```

## Configuration File

The configuration file is a JSON file in the following format: 

```json
{
  "migrationType" : "jira",
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
  "priorityMapping" : [
    {"source": "priority a", "destination": "Highest"},
    {"source": "priority b", "destination": "High"},
    {"source": "priority c", "destination": "Low"}
  ],
  "typeMapping" : [
    {"source": "design", "destination": "Design"},
    {"source": "bug", "destination": "Bug"},
    {"source": "task", "destination": "Development"}
  ],
  "userMappings" : [
    {"source": "first-username", "destination" : "second-username", "destinationName": "John Doe"}
  ]
}
```

Descriptions of each property are provided below: 

| Name                     | Description                                                  | Req. |
| ------------------------ | ------------------------------------------------------------ | ---- |
| `migrationType`          | Specifies whether migration is to another Github repo or for export to Jira (`github`, `jira`) | Yes  |
| `sourceRepository`       | Contains details of the originating repo.                    | Yes  |
| `repoOwner`              | Owner of the repo (organization or user)                     | Yes  |
| `repoName`               | Name of the repo                                             | Yes  |
| `accessToken`            | Developer token generated from Github.com to provide API access to the repo. | Yes  |
| `destinationRepository`  | Contains details of the Github destination repo.                    | Yes (for GitHub), No (for Jira)  |
| `method`                 | Type of migration (`all` = All issues, `label` = All with matching label(s), `issueNumber` = All with matching issue number(s). Default is `all`. | No |
| `labels`                 | Array of labels you wish to filter on (used when `method` = `label`) | No   |
| `issueNumbers`           | Array of issue numbers you wish you migrate (used when `method` = `issueNumber`) | No   |
| `stickyUsers`            | Boolean value indicating whether to maintain usernames when migrating the issue to the new repo. Set to `false` only when moving across organizations or when exporting to Jira. Default is `true`. | No   |
| `closeIssueWhenComplete` | Boolean value indicating whether to close the issue in the source repo on successful migration. Default is `false`. | No   |
| `addSourceComment`     | Boolean value indicating whether to add a migration comment in the source issue. Default is `true`. | No |
| `exportPath`             | Path used to place output CSV when exporting for Jira. Default is `export`. | No |
| `mappings`             | Container for optional mappings (primarily used when exporting to Jira). | No |
| `priorities`             | For Jira only - Array of priority mappings. For each item in the array, the `source` value indicates a label used in source repo, while `destination` value identifies the corresponding priority in Jira. | No |
| `types`             | For Jira only - Array of issue type mappings. For each item in the array, the `source` value indicates a label used in source repo, while `destination` value identifies the corresponding type in Jira. | No |
| `users`           | Array of username pairs that is used when `stickyUsers` = `false`. When moving repos across organizations or when exporting to Jira, these mappings are used to make sure usernames are maintained in assignments and inside the issue body and comments. When exporting to Jira, the `destination` value is used for core fields such as `Reporter` and `Assignee`, while `destinationName` is used inside comment and description text. | No  |