/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

/**
 * Per-send footer data that the template itself cannot know: the recipient's
 * one-click unsubscribe URL and the sender's postal address.
 *
 * Supplied by the sending function as a context provider around the rendered
 * template, so it stays scoped to a single render (no module-level mutable
 * state shared across concurrent sends).
 *
 * `postalAddress` is intentionally empty until the business owner supplies a
 * verified registered address — we never print an invented one.
 */
export interface EmailFooterData {
  unsubscribeUrl?: string
  postalAddress?: string
}

export const EmailFooterContext = React.createContext<EmailFooterData>({})

/** Registered postal address for the CAN-SPAM footer. Empty until provided. */
export const POSTAL_ADDRESS = ''
