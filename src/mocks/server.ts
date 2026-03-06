import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// MSW server for Node.js (unit/integration tests)
export const server = setupServer(...handlers);
