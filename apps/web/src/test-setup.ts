import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// The default of one second is a guess about the machine. Under a parallel run
// on a busy CI runner a first render can take longer, and a test that waits for
// it then fails for no reason of its own.
configure({ asyncUtilTimeout: 5000 });
