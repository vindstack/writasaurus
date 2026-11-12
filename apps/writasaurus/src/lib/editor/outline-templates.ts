export const OUTLINE_TEMPLATES = [
  {
    id: "three-act",
    label: "3-Act Structure",
    content: `# Act I - Setup

> Establish the protagonist, their world, and the central problem; end with a choice or event that commits them to the story.

## Opening Image

> Show the protagonist's world and mood before the main change begins.

## Set-Up

> Introduce the protagonist, important relationships, needs, and the ordinary situation that will be disrupted.

## Inciting Incident

> Introduce the event that upsets the status quo and gives the protagonist a problem to face.

## First Plot Point

> Turn the story into its main conflict: the protagonist commits to a goal or is forced onto a new path.

# Act II - Confrontation

> Follow the protagonist pursuing that goal as obstacles grow and their approach or understanding changes.

## Midpoint

> Make a major turn that changes the stakes, information, or direction of the pursuit.

## Second Plot Point

> Deliver the setback, discovery, or decision that pushes the protagonist toward the final confrontation.

# Act III - Resolution

> Bring the main conflict to its decisive test, then show the consequences and the new normal.

## Climax

> Stage the decisive confrontation where the central dramatic question is answered.

## Resolution

> Show what the climax changes for the protagonist and resolve the remaining story threads.

## Closing Image

> Echo the opening image in a changed world to make the protagonist's transformation visible.
`,
  },
  {
    id: "four-act",
    label: "4-Act Structure",
    content: `# Act I - Setup

> A flexible variation on three-act structure that splits the broad middle into two acts around a midpoint; act boundaries are not universal.

## Opening Situation

> Establish the protagonist, their world, relationships, and the situation that needs to change.

## Inciting Incident

> Disrupt the status quo with an event that starts the central problem.

## Turn into Act II

> Give the protagonist a goal or commitment that moves them into active pursuit.

# Act II - Rising Action

> Show the first phase of that pursuit, including early plans, progress, and growing opposition.

## Midpoint

> Shift the story's direction or stakes; the protagonist's understanding or position changes.

# Act III - Complications

> Explore the second phase of the central pursuit as the midpoint's consequences compound and options narrow.

## Crisis

> Bring the protagonist to a serious setback or hard choice that forces a new approach.

# Act IV - Resolution

> Carry that choice into the final confrontation and show its consequences.

## Climax

> Resolve the central dramatic question through the protagonist's decisive action.

## Resolution

> Show the result of the climax and what has changed.
`,
  },
  {
    id: "save-the-cat",
    label: "Save the Cat Beat Sheet",
    content: `# Save the Cat Beat Sheet

## Opening Image

> Establish the story's starting mood and give a first glimpse of the protagonist's world.

## Theme Stated

> Let a character voice an idea or question about life that the protagonist will test through the story.

## Set-Up

> Show the protagonist's starting life, key relationships, and the problems or needs that must change.

## Catalyst

> Disrupt the status quo with the event that launches the story's central problem.

## Debate

> Let the protagonist weigh the risks, resist, or question whether to act on the catalyst.

## Break into Two

> Make the choice that commits the protagonist to the story's new situation and goal.

## B Story

> Introduce a secondary storyline, often a relationship, that develops alongside or illuminates the theme.

## Fun and Games

> Deliver the distinctive situations promised by the premise as the protagonist explores the new world.

## Midpoint

> Create a major reversal, apparent victory, or apparent defeat that raises the stakes and changes the plan.

## Bad Guys Close In

> Tighten external pressure and internal conflict as obstacles become harder to overcome.

## All Is Lost

> Deliver a devastating setback that makes success seem out of reach.

## Dark Night of the Soul

> Give the protagonist space to face the loss and recognize what must change before trying again.

## Break into Three

> Let a new insight or combination of storylines reveal a workable path into the final act.

## Finale

> Carry out the final plan, confront the central opposition, and show the protagonist applying what they have learned.

## Final Image

> Echo the opening image in a way that makes the story's change visible.
`,
  },
  {
    id: "heros-journey",
    label: "Hero's Journey",
    content: `# Hero's Journey

> A popular 12-stage adaptation of the journey pattern; stories can vary or omit stages.

## Ordinary World

> Show the hero's familiar life and the need or limitation that will matter on the journey.

## Call to Adventure

> Present the challenge, opportunity, or disruption that invites the hero beyond the familiar.

## Refusal of the Call

> Show why the hero hesitates, resists, or fears what accepting the challenge may cost.

## Meeting the Mentor

> Introduce a guide, ally, or experience that offers advice, confidence, or a tool for the journey.

## Crossing the First Threshold

> Have the hero commit to leaving the familiar world and enter unfamiliar territory.

## Tests, Allies, and Enemies

> Let the hero learn the new world's rules, face trials, and discover who may help or oppose them.

## Approach to the Inmost Cave

> Move toward the central danger; the hero prepares and confronts the fears or obstacles before it.

## Ordeal

> Put the hero through the central crisis, where they face a major danger or loss and are changed by it.

## Reward

> Give the hero what they have earned or learned after surviving the ordeal.

## The Road Back

> Turn the hero toward home or the final goal while consequences or renewed opposition follow.

## Resurrection

> Test the hero in a final, defining crisis that shows how the journey has changed them.

## Return with the Elixir

> Bring the hero back with a lesson, remedy, or achievement that benefits their world.
`,
  },
  {
    id: "snowflake",
    label: "Snowflake Method",
    content: `# Snowflake Method

## Step 1 - One-Sentence Summary

> Capture the whole novel's core hook in one sentence: the central character, what they want, and what is at stake.

## Step 2 - One-Paragraph Summary

> Expand the hook into the setup, three major story disasters or turns, and the ending; this summarizes the whole story, not just its opening.

## Step 3 - Character Summary Sheets

> For each major character, summarize their storyline, motivation, concrete goal, conflict, epiphany, and arc.

## Step 4 - Expand the Summary Paragraph

> Expand each sentence into a paragraph, ending each pre-ending paragraph with a disaster and explaining the ending in the last.

## Step 5 - Character Synopses

> Tell the story from each important character's point of view, showing what they experience and how their thread fits the whole.

## Step 6 - Four-Page Synopsis

> Expand the one-page plot synopsis into a four-page account to clarify the story's logic and major decisions.

## Step 7 - Character Charts

> Record useful character facts and history, including description, motivation, goals, and how each person changes.

## Step 8 - Scene List

> List the scenes needed to tell the story; note each scene's point-of-view character and what happens.

## Step 9 - Scene Narratives (Optional)

> Expand each scene-list entry into a short narrative with its essential action, conflict, and any dialogue ideas.

## Step 10 - First Draft

> Draft the novel using the design as a guide, revising the plan as the characters and story develop.
`,
  },
  {
    id: "blank",
    label: "Blank Outline",
    content: "",
  },
] as const;

export const DEFAULT_OUTLINE = OUTLINE_TEMPLATES[0].content;
