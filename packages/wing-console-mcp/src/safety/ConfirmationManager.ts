import { v4 as uuidv4 } from "uuid";
import { ConfirmationTicket, Risk, WingValue } from "../types.js";

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
    expectedTarget: string
  ): { valid: boolean; error?: string; ticket?: ConfirmationTicket } {
    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      return { valid: false, error: "Confirmation ticket not found." };
    }

    if (Date.now() > ticket.expiresAt) {
      this.tickets.delete(ticketId);
      return { valid: false, error: "Confirmation has expired. Please re-prepare the change." };
    }

    if (ticket.tool !== expectedTool) {
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
