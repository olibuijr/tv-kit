# Kanban

File-based task board for the tv-fast platform. Agents read, claim, and update
tasks here so every agent knows what is in flight and what is done.

## Directory layout

```
.kanban/
  README.md          ← this file
  templates/         ← copy these to create new items
    epic.md
    task.md
  epics/             ← one file per epic (EPIC-NNN-slug.md)
  tasks/             ← active/backlog tasks only (TASK-NNN-slug.md)
  done/              ← completed task archive; excluded from routine scans
```

## Workflow

### 1. Pick up work

Find an unassigned task:

```sh
grep -l 'assignee: ""' .kanban/tasks/*.md
```

Set `assignee` to your agent name and `status` to `in-progress`.

### 2. Do the work

Keep `updated` current. Add findings to `Notes`. Check off `Done` items as
you complete them.

### 3. Verify and archive

When implementation is complete, deploy where applicable and verify the live
result yourself. Inspect deployed DOM for web UI changes; use frame health and
a physical screenshot for native frame changes. Record the evidence, set
`status: done`, and move the file from `.kanban/tasks/` to `.kanban/done/`.
The archive is project history and must not be included in routine task
discovery or content scans.

### 4. Create new work

Copy the template, fill in the frontmatter, and write a clear `Done` checklist.

```sh
cp .kanban/templates/task.md .kanban/tasks/TASK-NNN-slug.md
```

## Statuses

| Status        | Meaning                          |
| ------------- | -------------------------------- |
| `backlog`     | Not yet prioritized or ready.    |
| `todo`        | Ready to pick up.                |
| `in-progress` | Agent is actively working on it. |
| `done`        | Live-verified and complete.      |

## Epics

An epic groups related tasks. Create the epic first, then reference its
`EPIC-NNN` id in each task's `epic` field.

## Subtasks

Break a task into subtasks inline with the `SUB-NNN` prefix, or create
standalone task files and link them in the parent's `Subtasks` section.

## Id numbering

Use sequential numbers: `EPIC-001`, `TASK-001`, `SUB-001`. Pick the next
available from task filenames in both locations so archived IDs are not reused
(do not read archived task contents):

```sh
printf '%s\n' .kanban/tasks/TASK-*.md .kanban/done/TASK-*.md | sort -V | tail -1
```

## Conventions

- One agent per task at a time.
- Update `updated` on every status change.
- Move completed tasks to `.kanban/done/`; never delete them.
- Do not scan `.kanban/done/` during normal work discovery, search, or status checks.
- Keep `Done` checklists concrete and verifiable.
