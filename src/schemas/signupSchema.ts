import {string, z} from "zod"

export const signupSchema = z.object({
    firstname: z.string(),
    lastname: z.string(),
    email: z.string(),
    password: z.string().min(8)
})

export type SignupSchema = z.infer<typeof signupSchema>