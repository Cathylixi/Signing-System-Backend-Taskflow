// MOCK DATA: stands in for the people/group lookup the backend will provide
// (e.g. GET /api/directory?q=...). Replace once that endpoint exists.

export interface Person {
  name: string
  email: string
}

export interface Group {
  name: string
  email: string
  members: string[]
}

export const PEOPLE: Person[] = [
  { name: 'Alex Morgan', email: 'alex.morgan@company.com' },
  { name: 'Jamie Lee', email: 'jamie.lee@company.com' },
  { name: 'Priya Shah', email: 'priya.shah@company.com' },
  { name: 'Marcus Chen', email: 'marcus.chen@company.com' },
  { name: 'Dana Ortiz', email: 'dana.ortiz@company.com' },
  { name: 'Sam Wright', email: 'sam.wright@company.com' },
  { name: 'Taylor Brooks', email: 'taylor.brooks@company.com' },
  { name: 'Jordan Kim', email: 'jordan.kim@company.com' },
  { name: 'Riley Patel', email: 'riley.patel@company.com' },
  { name: 'Casey Nguyen', email: 'casey.nguyen@company.com' },
]

export const GROUPS: Group[] = [
  {
    name: 'All programmers',
    email: 'programmers@company.com',
    members: ['marcus.chen@company.com', 'jordan.kim@company.com', 'riley.patel@company.com', 'sam.wright@company.com'],
  },
  {
    name: 'Biostatistics',
    email: 'biostats@company.com',
    members: ['priya.shah@company.com', 'dana.ortiz@company.com', 'casey.nguyen@company.com'],
  },
  {
    name: 'Quality Assurance',
    email: 'qa@company.com',
    members: ['alex.morgan@company.com', 'taylor.brooks@company.com'],
  },
  {
    name: 'All staff',
    email: 'all@company.com',
    members: PEOPLE.map((p) => p.email),
  },
]
