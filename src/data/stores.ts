/** One store per domain. Each owns its own key; none reaches into another. */
import { createStore } from '../core/store.js'
import type { Agent, Attention, Blocker, MemoryFact, Project, SystemEvent, Task } from './types.js'

export const agentStore = createStore<Agent>('agents')
export const projectStore = createStore<Project>('projects')
export const blockerStore = createStore<Blocker>('blockers')
export const eventStore = createStore<SystemEvent>('events')
export const memoryStore = createStore<MemoryFact>('memory')
export const attentionStore = createStore<Attention>('attention')
/** Roman's own tasks. Not in the seed: the demo reset never touches them. */
export const taskStore = createStore<Task>('tasks')
