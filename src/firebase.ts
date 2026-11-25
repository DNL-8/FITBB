import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { app } from './firebaseApp';
import firebaseConfig from '../firebase-applet-config.json';

export { auth } from './firebaseApp';

function createPersistentFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db: Firestore = createPersistentFirestore();

async function testConnection(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function getFirestoreErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'permission-denied':
    case 'unauthenticated':
      return 'O banco de dados recusou o acesso. Confirme a sessão e o e-mail da conta.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'O banco de dados está indisponível. Verifique a conexão e tente novamente.';
    case 'aborted':
      return 'Os dados foram alterados durante a operação. Tente novamente.';
    default:
      return 'O banco de dados não conseguiu concluir a operação. Tente novamente.';
  }
}

export function handleFirestoreError(error: unknown, operation: OperationType): never {
  console.error('Operação Firestore não concluída', { operation });
  throw new Error(getFirestoreErrorMessage(error));
}
