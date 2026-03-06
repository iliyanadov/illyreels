import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// MSW worker for browser (E2E tests)
export const worker = setupWorker(...handlers);
