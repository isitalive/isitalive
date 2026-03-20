export interface IngestSource {
  name: string;
  getRepos(env: any): Promise<string[]>;
}
