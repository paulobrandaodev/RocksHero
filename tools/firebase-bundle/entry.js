// Subconjunto do SDK modular do Firebase usado pelo app, exposto como window.RHFirebase.
// Auth é iniciado com initializeAuth (sem o módulo de popup/redirect), o que evita
// carregar scripts do Google antes de saber quem está logado.
export { initializeApp } from 'firebase/app';
export {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator,
} from 'firebase/auth';
export {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  child,
  get,
  set,
  update,
  onValue,
  goOffline,
  goOnline,
} from 'firebase/database';
