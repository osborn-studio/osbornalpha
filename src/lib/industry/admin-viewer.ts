import {requireAdminUser} from '../admin/auth';

export async function isAdminViewer():Promise<boolean>{try{await requireAdminUser();return true;}catch{return false;}}
