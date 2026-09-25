// Adds DOM matchers such as toBeDisabled() and toHaveTextContent() to Vitest's expect.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest does not run RTL's automatic cleanup without globals, so unmount after each test here.
afterEach(cleanup);
