export type UserRole = "admin" | "trainer";

export type DemoUser = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

export const demoUsers: DemoUser[] = [
  {
    email: "admin@uapl.local",
    password: "Admin@1234",
    name: "UAPL Admin",
    role: "admin"
  },
  {
    email: "trainer@uapl.local",
    password: "Trainer@1234",
    name: "Trainer User",
    role: "trainer"
  }
];

export const sessionKey = "uapl_lms_session";
