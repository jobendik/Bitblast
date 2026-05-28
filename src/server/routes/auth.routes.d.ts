import { Request, Response, NextFunction } from 'express';
declare const router: import("express-serve-static-core").Router;
export interface AuthenticatedRequest extends Request {
    userId?: number;
}
export declare const checkAuth: (req: Request, res: Response, next: NextFunction) => void;
export default router;
//# sourceMappingURL=auth.routes.d.ts.map