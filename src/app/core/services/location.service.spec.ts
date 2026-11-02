import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Card } from '../models/card';
import { CardRepository } from './card-repository';
import { LocationService } from './location.service';

// Two Mega Image stores ~300 m apart, and a gym across town.
const LIPSCANI = { lat: 44.4318, lng: 26.1006, label: 'Mega Image, Lipscani', radiusM: 150 };
const UNIRII = { lat: 44.4293, lng: 26.1028, label: 'Mega Image, Unirii', radiusM: 150 };
const GYM = { lat: 44.4552, lng: 26.0853, label: 'Natural High', radiusM: 150 };

function card(id: string, locations: Card['locations']): Card {
  return { id, name: id, locations, createdAt: 0, lastUsedAt: null };
}

function setup(cards: Card[]): LocationService {
  TestBed.configureTestingModule({
    providers: [{ provide: CardRepository, useValue: { cards: signal(cards) } }],
  });
  return TestBed.inject(LocationService);
}

describe('LocationService nearby matching', () => {
  it('matches nothing before a position is known', () => {
    const service = setup([card('mega', [LIPSCANI])]);
    expect(service.matches()).toEqual([]);
  });

  it('matches a card when standing at one of its stores', () => {
    const service = setup([card('mega', [LIPSCANI, UNIRII]), card('gym', [GYM])]);
    service.position.set({ lat: 44.4319, lng: 26.1007, accuracy: 10, ts: Date.now() });
    const m = service.matches();
    expect(m.map((x) => x.card.id)).toEqual(['mega']);
    expect(m[0].distance).toBeLessThan(20);
  });

  it('uses the nearest of several stores of the same chain', () => {
    const service = setup([card('mega', [LIPSCANI, UNIRII])]);
    service.position.set({ lat: UNIRII.lat, lng: UNIRII.lng, accuracy: 10, ts: Date.now() });
    expect(service.matches()[0].distance).toBeLessThan(1);
  });

  it('ignores stores outside their radius', () => {
    const service = setup([card('mega', [LIPSCANI])]);
    // ~220 m north of Lipscani: outside the 150 m radius.
    service.position.set({ lat: 44.4338, lng: 26.1006, accuracy: 10, ts: Date.now() });
    expect(service.matches()).toEqual([]);
  });

  it('sorts several matching cards nearest first', () => {
    const service = setup([
      card('far', [{ ...LIPSCANI, radiusM: 500 }]),
      card('near', [{ ...UNIRII, radiusM: 500 }]),
    ]);
    service.position.set({ lat: UNIRII.lat, lng: UNIRII.lng, accuracy: 10, ts: Date.now() });
    expect(service.matches().map((x) => x.card.id)).toEqual(['near', 'far']);
    expect(service.nearbyMap().has('far')).toBe(true);
  });
});
