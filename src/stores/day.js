// stores/fonts.js
import { defineStore } from 'pinia'

import { useFirestore } from 'vuefire'
import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { LITURGICAL_DAYS_COLLECTION } from '@/constants/days'

export const useDayStore = defineStore('day', {
    state: () => {
        return {
            dayToEdit: {},
            dayToDelete: {}
        }
    },
    actions: {
        setDayToEdit(dte) {
            this.dayToEdit = dte;
        },
        async updateDay(dte) {
            this.dayToEdit = dte;
            
            const db = useFirestore()
            const docRef = doc(db, LITURGICAL_DAYS_COLLECTION, `${dte.id}`);

            await updateDoc(docRef, {
                ...dte
            });
        },
        async deleteDay(dte) {
            this.dayToDelete = dte;
            
            const db = useFirestore()
            const docRef = doc(db, LITURGICAL_DAYS_COLLECTION, `${dte.id}`);

            await deleteDoc(docRef, {
                ...dte
            });
        }
    },

    getters: {
        getDayToEdit: (state) => {
            return state.dayToEdit;
        }
    },
})
