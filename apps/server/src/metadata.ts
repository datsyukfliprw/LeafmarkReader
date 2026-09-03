import { isValidIsbn, normalizeIsbn } from '@leafmark/shared';
export type BookMetadata={isbn:string;title:string;author:string;edition?:string|null;publisher?:string|null;publicationDate?:string|null;pageCount?:number|null;description?:string|null;coverUrl?:string|null;source:string};
export interface BookMetadataProvider { lookup(isbn:string):Promise<BookMetadata|null> }
export class OpenLibraryProvider implements BookMetadataProvider{
  constructor(private timeoutMs=4500){}
  async lookup(raw:string){ const isbn=normalizeIsbn(raw); if(!isValidIsbn(isbn)) throw new Error('invalid_isbn');
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),this.timeoutMs); try{
      const res=await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`,{signal:c.signal}); if(!res.ok) return null; const json:any=await res.json(); const b=json[`ISBN:${isbn}`]; if(!b?.title) return null;
      return {isbn,title:b.title,author:Array.isArray(b.authors)?b.authors.map((a:any)=>a.name).filter(Boolean).join(', '):'Unknown author',publisher:Array.isArray(b.publishers)?b.publishers.map((p:any)=>p.name).filter(Boolean).join(', '):null,publicationDate:b.publish_date ?? null,pageCount:Number.isInteger(b.number_of_pages)?b.number_of_pages:null,description:typeof b.notes==='string'?b.notes:null,coverUrl:b.cover?.large ?? b.cover?.medium ?? b.cover?.small ?? null,source:'Open Library'};
    } finally {clearTimeout(t)}
  }
}
