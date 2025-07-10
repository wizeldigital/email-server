export const PERMISSIONS = {
    VIEW_ANALYTICS: 'VIEW_ANALYTICS',
    MANAGE_CAMPAIGNS: 'MANAGE_CAMPAIGNS',
    ADMIN: 'ADMIN'
};

export const hasPermission = (storeAccess, requiredPermission) => {
    if (!storeAccess || !storeAccess.permissions) return false;
    
    if (storeAccess.permissions.includes(PERMISSIONS.ADMIN)) {
        return true;
    }
    
    return storeAccess.permissions.includes(requiredPermission);
};