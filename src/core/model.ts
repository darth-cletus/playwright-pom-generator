export type Action = 'click'|'fill'|'check'|'select'|'read';
export interface Candidate { expression:string; score:number; count:number; basis:string }
export interface ElementModel { id:string; name:string; label:string; tag:string; action:Action; candidates:Candidate[]; selected:boolean; choice:number }
export interface PageModel { url:string; className:string; elements:ElementModel[] }
