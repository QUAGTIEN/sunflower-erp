/** Asks a kept-alive page to switch to one of its tabs, e.g. when a sidebar sub-item points at that tab. */
export interface PageTabRequest {
  tab: string;
  /** A new id per click, so choosing the same tab again after an in-page switch still applies. */
  requestId: number;
}
