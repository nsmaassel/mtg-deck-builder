import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectCollectionFormat } from './detect';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

describe('detectCollectionFormat', () => {
  it.each([
    ['real Player.log', fixture('player-log.sample.txt')],
    ['Player.log with detailed logs disabled', fixture('player-log.detailed-logs-disabled.txt')],
    ['log excerpt starting at a logger line', '[UnityCrossThreadLogger]5/1/2026 4:57:16 PM\n<== StartHook(131e62ff)\n{"InventoryInfo":{}}\n'],
    ['log excerpt starting at the response', '<== StartHook(131e62ff)\n{"InventoryInfo":{}}\n'],
    ['log header only', 'Loaded embedded metadata\nDETAILED LOGS: ENABLED\n'],
  ])('player-log: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBe('player-log');
  });

  it.each([
    ['daemon /cards (F1)', '{"cards":[{"grpId":73208,"owned":4},{"grpId":96269,"owned":2}],"elapsedTime":187}'],
    ['mtga-reader (F2)', '{"count":3512,"cards":[{"grpId":73208,"qty":4}]}'],
    ['manual snapshot (F3)', '{"schemaVersion":1,"source":"manual-import","cards":[{"arenaId":102646,"quantity":3}]}'],
    ['bare array (F3)', '[{"grpId":102646,"owned":3}]'],
    ['id map (F3)', '{"102646":3}'],
    ['Untapped API shape', '{"cards":[{"grpid":1,"quantity":2}]}'],
    ['daemon error', '{"error":"MTGA process not found"}'],
    ['leading whitespace', '  \n\t {"cards":[{"grpId":73208,"owned":4}]}'],
    ['cut-off JSON', '{"cards":[{"grpId":73208,"owned":4},{"grpId":9'],
  ])('grpid-json: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBe('grpid-json');
  });

  it.each([
    ['MTGA Deck Advisor (F6)', '{"exported_at":"2026-11-09T21:00:00+00:00","wildcards":null,"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100,101]}]}'],
    ['NthPhantom10 (F4)', '{\n  "export_date": "2026-11-09T21:00:00",\n  "cards": [\n    {"count": 4, "name": "Luminarch Aspirant", "set": "ZNR", "collector_number": "24", "arena_ids": [73208]}\n  ]\n}'],
    ['Collection Reader rows (F3)', '[{"name":"Luminarch Aspirant","quantity":4,"set_code":"ZNR","collector_number":"24"}]'],
    ['cut-off named JSON', '{"cards":[{"count":4,"name":"Lightning Bolt","arena_ids":[100'],
  ])('named-json: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBe('named-json');
  });

  it.each([
    ['Collection Reader (F3)', 'Count,Name,Edition,Collector Number,Condition,Language,Foil,Tag\n4,Luminarch Aspirant,ZNR,24,Near Mint,English,,\n'],
    ['Deckbox (F4)', 'Count,Tradelist Count,Name,Edition,Card Number,Condition,Language,Foil,Signed,Artist Proof,Altered Art,Misprint,Promo,Textless,My Price\n'],
    ['MTGGoldfish (F4)', 'Card,Set,Quantity\nOpt,ELD,4\n'],
    ['Cardsphere (F4)', 'Quantity,Card Name,Set,Foil\n4,Opt,ELD,\n'],
    ['MTG Arena Tool (F5)', 'Count;Name;Edition;Collector Number;Rarity\n4;Luminarch Aspirant;znr;24;rare\n'],
    ['MartoEporedia (F7)', 'Name,Set,CollectorNumber,Rarity,Quantity\n"Nicol Bolas, God-Pharaoh",AKR,247,Mythic,1\n'],
    ['Moxfield (F8)', 'Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price\n4,0,"Momo, Friendly Flier",tla,NM,English,,,,29,False,False,\n'],
    ['Archidekt (F9)', 'Quantity,Name,Edition Code,Collector Number,Condition,Language,Foil\n4,"Momo, Friendly Flier",TLA,29,Near Mint,English,\n'],
    ['with a BOM and blank first line', '﻿\r\nCount,Name\r\n4,Opt\r\n'],
  ])('csv: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBe('csv');
  });

  it.each([
    ['Arena export (F10)', '4 Momo, Friendly Flier (TLA) 29\n1 Abrade (FDN) 188\n'],
    ['Collection Reader text (F3)', '# mtga_collection.txt\n4 Luminarch Aspirant (ZNR) 24\n2 Lightning Bolt (FCA) 40\n'],
    ['NthPhantom10 text (F4)', 'MTGA Collection Export\nExported: 2026-11-09 21:00:00\nUnique cards: 3512\nTotal cards:   9120\n============================================================\n4x Luminarch Aspirant (ZNR) #24 [rare]\n\n'],
    ['Deck Advisor text (F6)', '4 Lightning Bolt\n2 Bonecrusher Giant\n'],
    ['Arena deck export', 'About\nName Azorius Control\n\nDeck\n4 Opt (ELD) 59\n'],
    ['one good line among junk', 'my cards:\n\n4 Opt\nthanks\n'],
  ])('arena-text: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBe('arena-text');
  });

  it.each([
    ['empty', ''],
    ['whitespace', '  \n\t\n'],
    ['prose', 'hello there\nthis is not a collection\n'],
    ['names without counts', 'Lightning Bolt\nOpt\n'],
    ['binary-ish', '\u0000\u0001\u0002PK\u0003\u0004��\u0000\u0008\n\u0000\u0000�'],
    ['a CSV with no usable columns', 'Foo,Bar\n1,2\n'],
  ])('null: %s', (_label, input) => {
    expect(detectCollectionFormat(input)).toBeNull();
  });

  it('checks for a Player.log before JSON, so a log that starts with a bracket is not JSON', () => {
    expect(detectCollectionFormat('[UnityCrossThreadLogger]FrontDoorConnectionAWS.Open {"creator":"x"}\n')).toBe('player-log');
  });
});
