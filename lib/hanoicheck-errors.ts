export class HanoiCheckApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'HanoiCheckApiError';
    this.status = status;
  }
}
