/**
 * @aureliajs/ssr Tokens
 * 
 * Shared isomorphic DI tokens safe for both server and client execution.
 * Zero JSDOM dependencies.
 */

import { DI, type Key } from 'aurelia';
import type { IRequestContext as IRequestContextData } from './types.js';

export type IRequestContext = IRequestContextData;

export interface IRequestContextToken {
  (target: object, propertyKey: string | symbol | undefined, parameterIndex?: number): void;
}

/**
 * Isomorphic Aurelia DI Token for Request Context
 * Usable with resolve(IRequestContext) on server and client.
 */
export const IRequestContext: IRequestContextToken & Key =
  /*@__PURE__*/ DI.createInterface<IRequestContextData>('IRequestContext') as unknown as IRequestContextToken & Key;
