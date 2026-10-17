/** Branded internal error; public handlers never serialize its cause. */
export class RevocationAccessDenied extends Error {
 constructor(cause:unknown){super('revocation_access_denied',{cause});}
}
