export type SessionContext = {
  user: {
    id: string;
    name: string;
    username: string;
  };
  profile: {
    id: string;
    name: string;
    code: string;
  };
  units: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  activeUnit: {
    id: string;
    name: string;
    code: string;
  };
};
