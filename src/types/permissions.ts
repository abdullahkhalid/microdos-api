/**
 * Community Roles and Permissions System
 * Based on the comprehensive requirements
 */

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin'
}

export enum GroupRole {
  MEMBER = 'member',
  MODERATOR = 'moderator',
  OWNER = 'owner'
}

export enum Permission {
  // User permissions
  READ_POSTS = 'read_posts',
  CREATE_POSTS = 'create_posts',
  EDIT_OWN_POSTS = 'edit_own_posts',
  DELETE_OWN_POSTS = 'delete_own_posts',
  
  // Comment permissions
  READ_COMMENTS = 'read_comments',
  CREATE_COMMENTS = 'create_comments',
  EDIT_OWN_COMMENTS = 'edit_own_comments',
  DELETE_OWN_COMMENTS = 'delete_own_comments',
  
  // Reaction permissions
  REACT_TO_POSTS = 'react_to_posts',
  REACT_TO_COMMENTS = 'react_to_comments',
  
  // Group permissions
  JOIN_GROUPS = 'join_groups',
  LEAVE_GROUPS = 'leave_groups',
  CREATE_GROUPS = 'create_groups',
  
  // Moderation permissions
  MODERATE_POSTS = 'moderate_posts',
  MODERATE_COMMENTS = 'moderate_comments',
  MODERATE_USERS = 'moderate_users',
  PIN_POSTS = 'pin_posts',
  LOCK_POSTS = 'lock_posts',
  HIDE_CONTENT = 'hide_content',
  REMOVE_CONTENT = 'remove_content',
  
  // Group moderation
  MANAGE_GROUP_MEMBERS = 'manage_group_members',
  MANAGE_GROUP_SETTINGS = 'manage_group_settings',
  APPROVE_GROUP_POSTS = 'approve_group_posts',
  
  // Admin permissions
  MANAGE_ALL_GROUPS = 'manage_all_groups',
  MANAGE_ALL_USERS = 'manage_all_users',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
  EXPORT_DATA = 'export_data',
  MANAGE_SYSTEM_SETTINGS = 'manage_system_settings'
}

export interface RolePermissions {
  [UserRole.USER]: Permission[];
  [UserRole.MODERATOR]: Permission[];
  [UserRole.ADMIN]: Permission[];
}

export interface GroupRolePermissions {
  [GroupRole.MEMBER]: Permission[];
  [GroupRole.MODERATOR]: Permission[];
  [GroupRole.OWNER]: Permission[];
}

// Base permissions for each role
const USER_PERMISSIONS: Permission[] = [
  Permission.READ_POSTS,
  Permission.CREATE_POSTS,
  Permission.EDIT_OWN_POSTS,
  Permission.DELETE_OWN_POSTS,
  Permission.READ_COMMENTS,
  Permission.CREATE_COMMENTS,
  Permission.EDIT_OWN_COMMENTS,
  Permission.DELETE_OWN_COMMENTS,
  Permission.REACT_TO_POSTS,
  Permission.REACT_TO_COMMENTS,
  Permission.JOIN_GROUPS,
  Permission.LEAVE_GROUPS,
  Permission.CREATE_GROUPS
];

const MODERATOR_ADDITIONAL_PERMISSIONS: Permission[] = [
  Permission.MODERATE_POSTS,
  Permission.MODERATE_COMMENTS,
  Permission.MODERATE_USERS,
  Permission.PIN_POSTS,
  Permission.LOCK_POSTS,
  Permission.HIDE_CONTENT,
  Permission.REMOVE_CONTENT,
  Permission.MANAGE_GROUP_MEMBERS,
  Permission.MANAGE_GROUP_SETTINGS,
  Permission.APPROVE_GROUP_POSTS,
  Permission.VIEW_AUDIT_LOGS
];

// Global role permissions
export const GLOBAL_ROLE_PERMISSIONS: RolePermissions = {
  [UserRole.USER]: USER_PERMISSIONS,
  
  [UserRole.MODERATOR]: [
    ...USER_PERMISSIONS,
    ...MODERATOR_ADDITIONAL_PERMISSIONS
  ],
  
  [UserRole.ADMIN]: [
    ...Object.values(Permission)
  ]
};

// Base group permissions
const GROUP_MEMBER_PERMISSIONS: Permission[] = [
  Permission.READ_POSTS,
  Permission.CREATE_POSTS,
  Permission.EDIT_OWN_POSTS,
  Permission.DELETE_OWN_POSTS,
  Permission.READ_COMMENTS,
  Permission.CREATE_COMMENTS,
  Permission.EDIT_OWN_COMMENTS,
  Permission.DELETE_OWN_COMMENTS,
  Permission.REACT_TO_POSTS,
  Permission.REACT_TO_COMMENTS
];

const GROUP_MODERATOR_ADDITIONAL_PERMISSIONS: Permission[] = [
  Permission.MODERATE_POSTS,
  Permission.MODERATE_COMMENTS,
  Permission.PIN_POSTS,
  Permission.LOCK_POSTS,
  Permission.HIDE_CONTENT,
  Permission.REMOVE_CONTENT,
  Permission.MANAGE_GROUP_MEMBERS,
  Permission.APPROVE_GROUP_POSTS
];

const GROUP_OWNER_ADDITIONAL_PERMISSIONS: Permission[] = [
  Permission.MANAGE_GROUP_SETTINGS
];

// Group role permissions
export const GROUP_ROLE_PERMISSIONS: GroupRolePermissions = {
  [GroupRole.MEMBER]: GROUP_MEMBER_PERMISSIONS,
  
  [GroupRole.MODERATOR]: [
    ...GROUP_MEMBER_PERMISSIONS,
    ...GROUP_MODERATOR_ADDITIONAL_PERMISSIONS
  ],
  
  [GroupRole.OWNER]: [
    ...GROUP_MEMBER_PERMISSIONS,
    ...GROUP_MODERATOR_ADDITIONAL_PERMISSIONS,
    ...GROUP_OWNER_ADDITIONAL_PERMISSIONS
  ]
};

export class PermissionChecker {
  /**
   * Check if a user has a specific permission globally
   */
  static hasGlobalPermission(userRole: UserRole, permission: Permission): boolean {
    return GLOBAL_ROLE_PERMISSIONS[userRole]?.includes(permission) || false;
  }
  
  /**
   * Check if a user has a specific permission in a group
   */
  static hasGroupPermission(groupRole: GroupRole, permission: Permission): boolean {
    return GROUP_ROLE_PERMISSIONS[groupRole]?.includes(permission) || false;
  }
  
  /**
   * Check if a user can perform an action on content they own
   */
  static canEditOwnContent(userId: string, contentAuthorId: string): boolean {
    return userId === contentAuthorId;
  }
  
  /**
   * Check if a user can moderate content in a group
   */
  static canModerateInGroup(
    userGlobalRole: UserRole,
    userGroupRole: GroupRole | null,
    groupId: string
  ): boolean {
    // Global moderators and admins can moderate anywhere
    if (userGlobalRole === UserRole.MODERATOR || userGlobalRole === UserRole.ADMIN) {
      return true;
    }
    
    // Group moderators and owners can moderate in their group
    if (userGroupRole === GroupRole.MODERATOR || userGroupRole === GroupRole.OWNER) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get all permissions for a user in a specific context
   */
  static getUserPermissions(
    userGlobalRole: UserRole,
    userGroupRole: GroupRole | null = null
  ): Permission[] {
    const globalPermissions = GLOBAL_ROLE_PERMISSIONS[userGlobalRole] || [];
    const groupPermissions = userGroupRole ? GROUP_ROLE_PERMISSIONS[userGroupRole] || [] : [];
    
    // Combine and deduplicate permissions
    return [...new Set([...globalPermissions, ...groupPermissions])];
  }
}

export interface AuthContext {
  userId: string;
  globalRole: UserRole;
  groupRoles: { [groupId: string]: GroupRole };
}

export class AuthService {
  /**
   * Check if user can perform action
   */
  static canPerformAction(
    authContext: AuthContext,
    permission: Permission,
    groupId?: string,
    contentAuthorId?: string
  ): boolean {
    // Check global permissions
    if (PermissionChecker.hasGlobalPermission(authContext.globalRole, permission)) {
      return true;
    }
    
    // Check group permissions if groupId is provided
    if (groupId && authContext.groupRoles[groupId]) {
      if (PermissionChecker.hasGroupPermission(authContext.groupRoles[groupId], permission)) {
        return true;
      }
    }
    
    // Check ownership for edit/delete permissions
    if (contentAuthorId && authContext.userId === contentAuthorId) {
      if (permission === Permission.EDIT_OWN_POSTS || 
          permission === Permission.DELETE_OWN_POSTS ||
          permission === Permission.EDIT_OWN_COMMENTS || 
          permission === Permission.DELETE_OWN_COMMENTS) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get user's effective permissions in a group
   */
  static getEffectivePermissions(
    authContext: AuthContext,
    groupId?: string
  ): Permission[] {
    const globalPermissions = GLOBAL_ROLE_PERMISSIONS[authContext.globalRole] || [];
    
    if (!groupId) {
      return globalPermissions;
    }
    
    const groupRole = authContext.groupRoles[groupId];
    const groupPermissions = groupRole ? GROUP_ROLE_PERMISSIONS[groupRole] || [] : [];
    
    return [...new Set([...globalPermissions, ...groupPermissions])];
  }
}
