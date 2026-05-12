import { v4 as uuidv4 } from "uuid";
import { ConfirmationTicket, Risk } from "../types.js";

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

    // Validate requestedValue hasn't changed from prepare to apply
    if (requestedValue !== undefined) {
      const ticketReq = JSON.stringify(ticket.requestedValue);
      const applyReq = JSON.stringify(requestedValue);
      if (ticketReq !== applyReq) {
        return {
          valid: false,
          error: `Requested value mismatch: prepared ${ticketReq}, but apply wants ${applyReq}. Re-prepare the change.`,
        };
      }
    }

    // Detect material state change between prepare and apply
    if (currentOldValue !== undefined) {
      const ticketOld = JSON.stringify(ticket.oldValue);
      const currentOld = JSON.stringify(currentOldValue);
      if (ticketOld !== currentOld) {
        return {
          valid: false,
          error: `State changed since prepare: value was ${ticketOld}, now ${currentOld}. Re-prepare the change.`,
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
      // Critical must contain key risk-acknowledgment phrases
      if (ticket.risk === "critical") {
        const text = confirmationText.toLowerCase();
        const hasAck = text.includes("确认") || text.includes("confirm") || text.includes("我知道") || text.includes("acknowledge");
        if (!hasAck) {
          return {
            valid: false,
            error: `Critical actions require risk acknowledgment. Say: "${ticket.exactConfirmationText}"`,
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
