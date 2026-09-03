import React from 'react'; import ReactDOM from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom'; import { QueryClient, QueryClientProvider } from '@tanstack/react-query'; import { App } from './App'; import './styles.css'; import { flushQueue } from './lib/offline';
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:15_000,retry:1},mutations:{retry:0}}});
window.addEventListener('online',()=>flushQueue().finally(()=>window.location.reload()));
if(navigator.onLine) flushQueue().catch(()=>{});
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></React.StrictMode>);
