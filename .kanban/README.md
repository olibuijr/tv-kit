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
  tasks/             ← one file per task (TASK-NNN-slug.md)
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

### 3. Hand off

When done, set `status: review`. Another agent reviews and sets `status: done`.

### 4. Create new work

Copy the template, fill in the frontmatter, and write a clear `Done` checklist.

```sh
cp .kanban/templates/task.md .kanban/tasks/TASK-NNN-slug.md
```

## Statuses

| Status       | Meaning                              |
| ------------ | ------------------------------------ |
| `backlog`    | Not yet prioritized or ready.        |
| `todo`       | Ready to pick up.                    |
| `in-progress`| Agent is actively working on it.     |
| `review`     | Done, needs another agent to verify. |
| `done`       | Verified and complete.               |

## Epics

An epic groups related tasks. Create the epic first, then reference its
`EPIC-NNN` id in each task's `epic` field.

## Subtasks

Break a task into subtasks inline with the `SUB-NNN` prefix, or create
standalone task files and link them in the parent's `Subtasks` section.

## Id numbering

Use sequential numbers: `EPIC-001`, `TASK-001`, `SUB-001`. Pick the next
available by listing existing files:

```sh
ls .kanban/epics/ .kanban/tasks/
```

## Conventions

- One agent per task at a time.
- Update `updated` on every status change.
- Never delete done tasks — they are the project log.
- Keep `Done` checklists concrete and verifiable.
