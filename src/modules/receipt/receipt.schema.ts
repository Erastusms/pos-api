// ─── Response schemas (for Swagger) ──────────────────────────────────────────
// prettier-ignore
export const receiptResponseSchema = {
  type: 'object',
  properties: {
    id:           { type: 'string' },
    orderId:      { type: 'string' },
    outletId:     { type: 'string' },
    status:       { type: 'string', enum: ['QUEUED', 'GENERATING', 'READY', 'FAILED'] },
    pdfUrl:       { type: 'string', nullable: true, description: 'URL PDF saat status=READY' },
    jobId:        { type: 'string', nullable: true },
    errorMessage: { type: 'string', nullable: true },
    attempts:     { type: 'number' },
    createdAt:    { type: 'string', format: 'date-time' },
    updatedAt:    { type: 'string', format: 'date-time' },
  },
}
