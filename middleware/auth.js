/**
 * Authentication middleware to validate private keys on every API call
 */
export function validatePrivateKey(req, res, next) {
    try {
        // Get the private key from various possible locations
        const privateKey = req.headers['x-private-key'] || 
                          req.headers['authorization']?.replace('Bearer ', '') ||
                          req.query.privateKey ||
                          req.body.privateKey;

        if (!privateKey) {
            return res.status(401).json({
                error: 'Private key is required',
                message: 'Please provide a private key in the x-private-key header, Authorization header, or request body'
            });
        }

        // Validate private key format (customize this validation as needed)
        if (!isValidPrivateKey(privateKey)) {
            return res.status(401).json({
                error: 'Invalid private key format',
                message: 'The provided private key is not in a valid format'
            });
        }

        // Attach the private key to the request for use in route handlers
        req.privateKey = privateKey;
        
        // Log the private key validation (remove in production for security)
        console.log(`🔑 Private key validated for ${req.method} ${req.path}`);
        
        next();
    } catch (error) {
        console.error('❌ Private key validation error:', error);
        return res.status(500).json({
            error: 'Authentication error',
            message: 'An error occurred during private key validation'
        });
    }
}

/**
 * Validates the private key against the environment variable
 */
function isValidPrivateKey(privateKey) {
    const validPrivateKey = process.env.PRIVATE_KEY;
    
    if (!validPrivateKey) {
        console.error('❌ PRIVATE_KEY not set in environment variables');
        return false;
    }
    
    // Direct comparison with the environment variable
    return privateKey === validPrivateKey;
}

/**
 * Optional: Enhanced validation middleware that can check against a database
 */
export async function validatePrivateKeyWithDB(req, res, next) {
    try {
        const privateKey = req.headers['x-private-key'] || 
                          req.headers['authorization']?.replace('Bearer ', '') ||
                          req.query.privateKey ||
                          req.body.privateKey;

        if (!privateKey) {
            return res.status(401).json({
                error: 'Private key is required'
            });
        }

        // TODO: Add database lookup to validate the private key
        // const isValid = await validateKeyInDatabase(privateKey);
        // if (!isValid) {
        //     return res.status(401).json({
        //         error: 'Invalid private key'
        //     });
        // }

        req.privateKey = privateKey;
        next();
    } catch (error) {
        console.error('❌ Database private key validation error:', error);
        return res.status(500).json({
            error: 'Authentication error'
        });
    }
}