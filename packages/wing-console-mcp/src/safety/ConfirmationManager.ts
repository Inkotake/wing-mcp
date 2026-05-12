import { v4 as uuidv4 } from "uuid";
import { ConfirmationTicket, Risk, WingValue } from "../types.js";

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Normalize confirmation text for comparison: collapse whitespace, trim */
function normalizeConfirmationText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Tolerant value comparison for state drift / readback checks.
 * Floats are compared with dB-appropriate tolerance to avoid false mismatches.
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;

  // WingValue objects
  if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
    const wa = a as WingValue;
    const wb = b as WingValue;
    if (wa.type !== wb.type) return false;

    switch (wa.type) {
      case "float": {
        const va = wa.value as number;
        const vb = (wb as WingValue).value as number;
        const unit = wa.unit ?? "";
        // dB values: 0.1 dB tolerance; linear: 0.001 tolerance
        const tol = unit === "dB" || unit === "dBFS" ? 0.15 : unit === "%" ? 0.15 : 0.001;
        return Math.abs(va - vb) < tol;
      }
      case "int":
        return wa.value === (wb as WingValue).value;
      case "bool":
        return wa.value === (wb as WingValue).value;
      case "string":
        return wa.value === (wb as WingValue).value;
      case "node":
        return JSON.stringify(wa.value) === JSON.stringify((wb as WingValue).value);
      default:
        return false;
    }
  }

  // Plain values
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.001;
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

export class ConfirmationManager {
  private tickets: Map<string, ConfirmationTicket> = new Map();

  createTicket(
    tool: string,
    target: string,
    risk: Risk,
    oldValue: unknown,
    requestedValue: unknown,
    reason: string,
    exactConfirmationText: string
  ): ConfirmationTicket {
    const ticket: ConfirmationTicket = {
      id: uuidv4(),
      tool,
      target,
      risk,
      oldValue,
      requestedValue,
      reason,
      exactConfirmationText,
      createdAt: Date.now(),
      expiresAt: Date.now() + CONFIRMATION_TTL_MS,
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  validateTicket(
    ticketId: string,
    expectedTool: string,
    expectedTarget: string,
    requestedValue?: unknown,
    confirmationText?: string,
    currentOldValue?: unknown,
  ): { valid: boolean; error?: string; ticket?: ConfirmationTicket } {
    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      return { valid: false, error: "Confirmation ticket not found." };
    }

    if (Date.now() > ticket.expiresAt) {
      this.tickets.delete(ticketId);
      return { valid: false, error: "Confirmation has expired. Please re-prepare the change." };
    }

    // Normalize tool names: strip _prepare/_apply suffix so pairs match
    const normalize = (t: string) => t.replace(/_(prepare|apply)$/, "");
    if (normalize(ticket.tool) !== normalize(expectedTool)) {
      return {
        valid: false,
        error: `Tool mismatch: ticket was for ${ticket.tool}, but ${expectedTool} was called.`,
      };
    }

    if (ticket.target !== expectedTarget) {
      return {
        valid: false,
        error: `Target mismatch: ticket was for ${ticket.target}, but ${expectedTarget} was called.`,
      };
    }

    // Validate requestedValue hasn't changed from prepare to apply (tolerant float compare)
    if (requestedValue !== undefined) {
      if (!valuesEqual(ticket.requestedValue, requestedValue)) {
        return {
          valid: false,
          error: `Requested value mismatch: prepared ${JSON.stringify(ticket.requestedValue)}, but apply wants ${JSON.stringify(requestedValue)}. Re-prepare the change.`,
        };
      }
    }

    // Detect material state change between prepare and apply (tolerant float compare)
    if (currentOldValue !== undefined) {
      if (!valuesEqual(ticket.oldValue, currentOldValue)) {
        return {
          valid: false,
          error: `State changed since prepare: value was ${JSON.stringify(ticket.oldValue)}, now ${JSON.stringify(currentOldValue)}. Re-prepare the change.`,
        };
      }
    }

    // For high/critical risk, validate confirmation text
    if (ticket.risk === "high" || ticket.risk === "critical") {
      if (!confirmationText || confirmationText.trim().length === 0) {
        return {
          valid: false,
          error: `Confirmation text required for ${ticket.risk} risk actions.`,
        };
      }
      // Critical: must EXACTLY match the required confirmation template
      if (ticket.risk === "critical") {
        const normalizedUser = normalizeConfirmationText(confirmationText);
        const normalizedRequired = normalizeConfirmationText(ticket.exactConfirmationText);
        if (normalizedUser !== normalizedRequired) {
          return {
            valid: false,
            error: `Exact confirmation required. You must say: "${ticket.exactConfirmationText}"`,
          };
        }
      }
    }

    return { valid: true, ticket };
  }

  consumeTicket(ticketId: string): ConfirmationTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    this.tickets.delete(ticketId);
    return ticket;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, ticket] of this.tickets) {
      if (now > ticket.expiresAt) {
        this.tickets.delete(id);
      }
    }
  }
}
