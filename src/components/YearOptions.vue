<template>
    <div>
    <v-data-table :headers="headers" :items="options" class="elevation-1" >
        <template v-slot:top>
            <v-toolbar flat>
                <v-toolbar-title>Year Options</v-toolbar-title>
                <v-divider class="mx-4" inset vertical></v-divider>
                <v-spacer></v-spacer>
                <v-dialog v-model="dialog" max-width="500px">
                    <template v-slot:activator="{ props }">
                        <v-btn color="primary" class="mb-2" v-bind="props">
                            New Item
                        </v-btn>
                    </template>
                    <v-card>
                        <v-card-title>
                            <span class="text-h5">{{ formTitle }}</span>
                        </v-card-title>

                        <v-card-text>
                            <v-container>
                                <v-row>
                                    <v-col v-for="n in Object.getOwnPropertyNames(editedItem)" :key="n" cols="12" sm="6" md="4">
                                        <v-text-field v-model="editedItem[n]" :label="`${n}`"></v-text-field>
                                    </v-col>   
                                </v-row>
                            </v-container>
                        </v-card-text>

                        <v-card-actions>
                            <v-spacer></v-spacer>
                            <v-btn color="blue-darken-1" variant="text" @click="close">
                                Cancel
                            </v-btn>
                            <v-btn color="blue-darken-1" variant="text" @click="save">
                                Save
                            </v-btn>
                        </v-card-actions>
                    </v-card>
                </v-dialog>
                <v-dialog v-model="dialogDelete" max-width="500px">
                    <v-card>
                        <v-card-title class="text-h5">Are you sure you want to delete this item?</v-card-title>
                        <v-card-actions>
                            <v-spacer></v-spacer>
                            <v-btn color="blue-darken-1" variant="text" @click="closeDelete">Cancel</v-btn>
                            <v-btn color="blue-darken-1" variant="text" @click="deleteItemConfirm">OK</v-btn>
                            <v-spacer></v-spacer>
                        </v-card-actions>
                    </v-card>
                </v-dialog>
            </v-toolbar>
        </template>
        <template v-slot:item.actions="{ item }">
            <v-icon size="small" class="me-2" @click="editItem(item.raw, item.value)">
                mdi-pencil
            </v-icon>
            <v-icon size="small" @click="deleteItem(item.raw, item.value)">
                mdi-delete
            </v-icon>
        </template>
        <!-- <template v-slot:no-data>
            <v-btn color="primary" @click="initialize">
                Reset
            </v-btn>
        </template> -->
    </v-data-table></div>
</template>


<script>
import { useCollection , useFirestore } from 'vuefire'
import { collection, doc, setDoc , deleteDoc } from 'firebase/firestore'

export default {
    data: () => ({
        dialog: false,
        dialogDelete: false,
        headers: [
            {
                title: 'Year',
                align: 'start',
                sortable: true,
                key: 'id',
            },
            { title: 'Папялец', key: 'ashWednesday', sortable: false, },
            { title: 'Вялікдзень', key: 'easterSunday', sortable: false, },
            { title: 'Унеба­ў­шэсце', key: 'ascension', sortable: false, }, 
            { title: 'Спасланне Духа Святога', key: 'pentecost', sortable: false, }, 
            { title: 'Найсв.Цела і Крыві Хрыста', key: 'corpuschristi', sortable: false, }, 
            { title: 'Пачатак звычайнага перад пастом', key: 'ordintaryStart1', sortable: false, }, 
            { title: 'Колькасць тыдняў перад пастом', key: 'ordintaryWeeks1', sortable: false, }, 
            { title: 'Пачатак звычайнага пасля Вялікадня', key: 'ordintaryStart2', sortable: false, }, 
            { title: 'Колькасць тыдняў пасля вялікадня', key: 'ordintaryWeeks2', sortable: false, }, 
            { title: 'Першая нядзеля адвэнту', key: 'firstAdventSunday', sortable: false, },
            { title: 'Actions', key: 'actions', sortable: false },
        ],
        options: [],
        loading: true,
        editedIndex: -1,
        editedItem: {
            year: '',
            ashWednesday: "",
            easterSunday: "",
            ascension: '',
            pentecost: "",
            corpuschristi: "",

            ordintaryStart1: "",
            ordintaryWeeks1: "",
            ordintaryStart2: '',
            ordintaryWeeks2: "",
            firstAndventSunday: "",
        },
        defaultItem: {
            year: '',
            ashWednesday: "",
            easterSunday: "",
            ascension: '',
            pentecost: "",
            corpuschristi: "",

            ordintaryStart1: "",
            ordintaryWeeks1: "",
            ordintaryStart2: '',
            ordintaryWeeks2: "",
            firstAndventSunday: "",
        },
    }),

    computed: {
        formTitle() {
            return this.editedIndex === -1 ? 'New Item' : 'Edit Item'
        },
    },

    watch: {
        dialog(val) {
            val || this.close()
        },
        dialogDelete(val) {
            val || this.closeDelete()
        },
    },

    created() {
        this.initialize()
    },

    methods: {
        initialize() {
            const db = useFirestore()
            this.options = useCollection(collection(db, 'yearOptions'))

            //console.log(todos)

            // this.options = [
            //     {
            //         id: '2023',
            //         ash: '22-2',
            //         easter: '9-4'
            //     },
            //     {
            //         id: '2024',
            //         ash: '22-2',
            //         easter: '9-4'
            //     },
            // ]
        },

        editItem(item, id) {
            this.editedIndex = this.options.indexOf(item)
            this.editedItem = Object.assign({}, item)
            this.editedItem.year = id

            this.dialog = true
        },

        deleteItem(item, id) {
            this.editedIndex = this.options.indexOf(item)
            this.editedItem = Object.assign({}, item)
            this.editedItem.year = id
            this.dialogDelete = true
        },

        async deleteItemConfirm() {
            this.options.splice(this.editedIndex, 1)
            const db = useFirestore()
            await deleteDoc(doc(db, "yearOptions", this.editedItem.year));

            this.closeDelete()
        },

        close() {
            this.dialog = false
            this.$nextTick(() => {
                this.editedItem = Object.assign({}, this.defaultItem)
                this.editedIndex = -1
            })
        },

        closeDelete() {
            this.dialogDelete = false
            this.$nextTick(() => {
                this.editedItem = Object.assign({}, this.defaultItem)
                this.editedIndex = -1
            })
        },

        async save() {
            if (this.editedIndex > -1) {
                Object.assign(this.options[this.editedIndex], this.editedItem);


            const db = useFirestore()
            const dbOptions = collection(db, "yearOptions");
            await setDoc(doc(dbOptions, this.editedItem.year), this.editedItem);

            } else {
                
                const db = useFirestore()
            const dbOptions = collection(db, "yearOptions");
            await setDoc(doc(dbOptions, this.editedItem.year), this.editedItem);
                
            }
            this.close()
        },
    },
}
</script>
    
<!-- <script setup>

import { ref } from 'vue'



import { useDocument, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc } from 'firebase/firestore'

const items = ref([
        { id: 1, a: 'Item 1A', b: 'Item 1B' },
        { id: 2, a: 'Item 2A', b: 'Item 2B' },
        { id: 3, a: 'Item 3A', b: 'Item 3B' },
      ])
      const dialogVisible = ref(false);
      const editMode = ref(false);
      const editedItem = ref({ a: '', b: '' });

function openAddDialog() {
      editMode.value = false;
      editedItem.value = { a: '', b: '' };
      dialogVisible.value = true;
    }

    function openEditDialog(item) {
      editMode.value = true;
      editedItem.value = { ...item };
      dialogVisible.value = true;
    }

    function saveItem() {
      if (editMode.value) {
        // Update existing item
        const index = items.value.findIndex((item) => item.id === editedItem.value.id);
        if (index !== -1) {
          items.value.splice(index, 1, editedItem.value);
        }
      } else {
        // Add new item
        const newId = items.value.length + 1;
        items.value.push({ id: newId, ...editedItem.value });
        console.log(items)
      }

      closeDialog();
    }

    function closeDialog() {
      dialogVisible.value= false;
    }


const db = useFirestore()


const first = new Date('01.09.2023');
const firstDayNum = getDayOfYear(first)
const todayDayNum = getDayOfYear()
const weekNum = Math.floor((todayDayNum - firstDayNum) / 7)
const firstDayOfWeek = (todayDayNum - firstDayNum - weekNum * 7) == 0


var { data: currentWeek, pending } = useDocument(doc(db, 'weeks', (weekNum + 1).toString()))

var { data: current, pending } = useDocument(doc(db, 'days', (todayDayNum - firstDayNum + 1).toString()))

function strippedHtml(value) {
    if (!value)
        return ""

    let regex = /(<([^>]+)>)/ig;
    return value.replace(regex, "");
}

function getDayOfYear(date = new Date()) {
    const timestamp1 = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );
    const timestamp2 = Date.UTC(date.getFullYear(), 0, 0);

    const differenceInMilliseconds = timestamp1 - timestamp2;

    const differenceInDays = differenceInMilliseconds / 1000 / 60 / 60 / 24;

    return differenceInDays;
}

</script>

<style>
.v-card .v-card-text {
    line-height: 1.35rem !important;
}

.v-card-text {
    font-size: 0.975rem !important;
}
</style> -->