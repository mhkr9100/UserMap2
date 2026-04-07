import { UserProfile } from '../types';

/** UserMap has no account system. This hook returns a permanent local user. */
const LOCAL_USER: UserProfile = {
    id: 'local',
    email: '',
    name: 'Architect',
    avatar: ''
};

export const useAuth = () => {
    return {
        currentUser: LOCAL_USER
    };
};
