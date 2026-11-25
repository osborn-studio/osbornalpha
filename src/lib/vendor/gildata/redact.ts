// Scrub literal and URL-encoded credentials before constructing an error.
export function redactSecret(text:string,secret:string|undefined):string{
 if(!secret||secret.length<4)return text;
 const encoded=encodeURIComponent(secret.toWellFormed());
 return text.replaceAll(encoded,'***').replaceAll(secret,'***');
}
