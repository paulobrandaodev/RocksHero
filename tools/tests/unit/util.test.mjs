import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadApp, plain } from './harness.mjs';

const { RH } = loadApp({ files: ['js/constants.js', 'js/util.js'] });
const U = RH.util;

test('sha256 bate com vetores conhecidos e com o crypto do Node', () => {
  assert.equal(U.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(U.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const samples = ['rockshero:Hero@123', 'ção é ♫ 🎸', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(1000)];
  for (const s of samples) {
    assert.equal(U.sha256(s), createHash('sha256').update(s).digest('hex'), `falhou para ${s.slice(0, 20)}`);
  }
});

test('hash da senha do modo local corresponde a Hero@123', () => {
  assert.equal(U.sha256('rockshero:Hero@123'), 'a5647462c595810fbd4769adc8de83882e37b739b0b89a9f4c2d05a8d505edac');
});

test('mediana com quantidade ímpar, par e vazia', () => {
  assert.equal(U.median([50, 10, 90]), 50);
  assert.equal(U.median([0, 100, 40, 60]), 50);
  assert.equal(U.median([]), null);
});

test('setPath grava, remove e poda objetos vazios', () => {
  const obj = {};
  U.setPath(obj, 'progress/a--b/m-vocal', { v: 10, t: 1 });
  U.setPath(obj, 'progress/a--b/m-baixo', { v: 20, t: 1 });
  U.setPath(obj, 'progress/a--b/m-vocal', null);
  assert.deepEqual(plain(obj), { progress: { 'a--b': { 'm-baixo': { v: 20, t: 1 } } } });
  U.setPath(obj, 'progress/a--b/m-baixo', null);
  assert.deepEqual(plain(obj), {});
  U.setPath(obj, 'inexistente/x', null);
  assert.deepEqual(plain(obj), {});
});

test('assertLeafPaths rejeita caminho pai e filho na mesma escrita', () => {
  assert.doesNotThrow(() => U.assertLeafPaths(['progress/a/m-1', 'progress/a/m-2', 'members/m-1']));
  assert.throws(() => U.assertLeafPaths(['members/m-1', 'members/m-1/name']));
  assert.doesNotThrow(() => U.assertLeafPaths(['members/m-1', 'members/m-10']));
});

test('posições fracionárias e renormalização', () => {
  assert.equal(U.positionBetween(null, null), 1);
  assert.equal(U.positionBetween(null, 3), 2);
  assert.equal(U.positionBetween(3, null), 4);
  assert.equal(U.positionBetween(1, 2), 1.5);
  assert.equal(U.needsRenormalize(1, 1 + 1e-7), true);
  assert.equal(U.needsRenormalize(1, 2), false);
  assert.equal(U.needsRenormalize(null, 2), false);
});

test('fold remove acentos para busca', () => {
  assert.equal(U.fold('Motörhead – Ação'), 'motorhead – acao');
});

test('instrumentação: parse e formato canônico', () => {
  assert.deepEqual(plain(RH.parseIns('vggbdk')), { v: 1, g: 2, b: 1, d: 1, k: 1, p: 0, s: 0, c: 0, h: 0, j: 0 });
  assert.equal(RH.parseIns('gvbd'), null, 'ordem fora do padrão é inválida');
  assert.equal(RH.parseIns(null), null);
  assert.equal(RH.formatIns({ g: 2, v: 1, d: 1, b: 1, s: 1 }), 'vggbds');
  assert.equal(RH.INS_PATTERN.test(''), true);
});

test('afinação: códigos conhecidos, livres e desconhecida', () => {
  assert.equal(RH.tuningInfo('dropD').short, 'Drop D');
  assert.equal(RH.tuningInfo('other:C# aberta').short, 'C# aberta');
  assert.equal(RH.tuningInfo(null).unknown, true);
});
