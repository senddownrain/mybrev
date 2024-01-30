<template>
	<v-col cols="6">
		<v-textarea :label="fieldTitle" auto-grow variant="filled" v-model="dte[fieldName]"></v-textarea>
	</v-col>
	<v-col cols="6">
		<v-card class="ora-edit" flat>
			<v-card-text class="ora-edit-text">
				<div v-html="dte[fieldName]"></div>
			</v-card-text>
		</v-card>
	</v-col>
</template>

<script setup>
const props = defineProps({
	dte: Object,
	fieldName: String,
	fieldTitle: String
})

import { useFontStore } from '@/stores/font'
const font = useFontStore()

</script>


<style>
.ora-edit-text p {
	margin-top: 10px;
	margin-bottom: 10px;
}

.v-card .ora-edit-text {
	padding-left: 0;
	font-size: v-bind('font.getHeader.textSize');
	line-height: v-bind('font.getHeader.textLine');
}

/* 
.ora-text{
    padding-left: 0;
    font-size: 0.975rem;
    line-height: 1.4rem;
    letter-spacing: 0.02rem;
} 


    letter-spacing: v-bind('font.getHeader.textLetterSpacing');

    letter-spacing: v-bind('font.getHeader.headerLetterSpacing');
}
*/


.ora-edit {}
</style>