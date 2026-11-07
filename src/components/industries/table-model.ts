// src/components/industries/table-model.ts
// The cell of one industry at the latest period (list table, both the value and the stored YoY companion).
import type {PublicCell} from '@/lib/industry/read';

export const cellAt=(list:PublicCell[],code:string,periodEnd:string|undefined):PublicCell|null=>list.find(c=>c.code===code&&c.periodEnd===periodEnd)??null;
