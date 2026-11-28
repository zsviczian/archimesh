export class ConceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConceptError';
  }
}
