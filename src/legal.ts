/**
 * The registered A2P 10DLC Sole Proprietor brand. Carriers reject campaigns
 * whose opt-in and terms name a different sender than the brand, so every SMS
 * disclosure names the operator, with Athena as the product.
 */
export const SMS_OPERATOR = 'Ross Bryson';
export const SMS_SENDER = `${SMS_OPERATOR} (Athena)`;
