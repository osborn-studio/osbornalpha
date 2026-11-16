// src/lib/judgments/band.ts
// Tercile band of a probability (spec §9.2 / §9.3): [0, 1/3) low, [1/3, 2/3) mid, [2/3, 1] high. Import-free so client
// components can use it (display.ts imports canonical.ts → node crypto); display.ts and the private adapter (Task 20)
// re-export this one definition.
export type Band='low'|'mid'|'high';
export const bandOf=(p:number):Band=>p<1/3?'low':p<2/3?'mid':'high';
