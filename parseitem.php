<?php
	echo parseURL($_GET('stats'));

	function parseURL($url) {
		$temp = str_split($url, 2);
		$stats = {};
		for (var $i = 0; i < count($temp); i++) {
			$stats[$temp[$i]] = $stats[$temp[$i+1]];
			$i++; 
		}
		return $stats;
	}
?>