window.RH = window.RH || {};

// Configuração do Firebase (passo a passo no README).
// Enquanto `config` estiver vazio, o app roda em MODO LOCAL: dados só neste navegador.
RH.FIREBASE = {
  // Firebase console › Configurações do projeto › Seus apps › App da Web › "Configuração do SDK" (objeto firebaseConfig).
  config: {
    apiKey: 'AIzaSyA-B1YBemWZiQ5mhagt4S7HmPeW0-JIVzA',
    authDomain: 'rockshero.firebaseapp.com',
    databaseURL: 'https://rockshero-default-rtdb.firebaseio.com/', // ex.: https://rocks-hero-default-rtdb.firebaseio.com (obrigatório)
    projectId: 'rockshero',
    storageBucket: 'rockshero.firebasestorage.app',
    appId: '1:83537984757:web:44e13f2977e6c3680059bc',
  },

  // Conta única da banda (Authentication › Users). A senha NÃO fica no código:
  // ela é cadastrada no console do Firebase (Hero@123).
  bandEmail: 'rockshero@example.com',

  // Nó raiz dos dados no Realtime Database (precisa bater com database.rules.json).
  root: 'rockshero',
};
